import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import OpenAI, { toFile } from "openai";
import { ZodError } from "zod";
import { UserError } from "./errors.js";
import { isUrl } from "./input.js";
import { extractAudio, extractFrames, getMediaDurationSec, splitAudioIfNeeded } from "./media.js";
import { buildMergedTimeline, dedupeVideoTextSpans, parseOcrJson, parseSummaryJson, renderSummaryText, renderTextTranscript } from "./text.js";
import type { Artifacts, AudioChunkResult, CliOptions, PipelineResult, SourceInfo, SummaryResult, VideoTextSpan } from "./types.js";

async function ensureCommand(command: string, helpText: string): Promise<void> {
  try {
    await execa("which", [command]);
  } catch {
    throw new UserError(`${command} is required but was not found on PATH. ${helpText}`);
  }
}

async function resolveInput(input: string, workDir: string): Promise<{ kind: "url" | "file"; path: string }> {
  if (!isUrl(input)) {
    const sourcePath = path.resolve(input);
    const fileInfo = await stat(sourcePath).catch(() => null);
    if (!fileInfo?.isFile()) {
      throw new UserError(`Input file does not exist: ${sourcePath}`);
    }
    return { kind: "file", path: sourcePath };
  }

  await ensureCommand("yt-dlp", "Install yt-dlp to download public Reel URLs.");

  const downloadsDir = path.join(workDir, "downloads");
  await mkdir(downloadsDir, { recursive: true });

  await execa("yt-dlp", [
    "--no-playlist",
    "-o",
    path.join(downloadsDir, "source.%(ext)s"),
    input
  ]);

  const candidates = (await readFileList(downloadsDir)).filter((file) => path.basename(file).startsWith("source."));
  if (candidates.length === 0) {
    throw new UserError("yt-dlp completed but no downloaded media file was found.");
  }

  candidates.sort();
  return {
    kind: "url",
    path: candidates[candidates.length - 1]
  };
}

async function readFileList(dirPath: string): Promise<string[]> {
  const entries = await (await import("node:fs/promises")).readdir(dirPath);
  return entries.map((entry) => path.join(dirPath, entry));
}

function ensureApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new UserError("OPENAI_API_KEY is required.");
  }
  return apiKey;
}

async function transcribeAudio(
  client: OpenAI,
  audioPath: string,
  model: string,
  tempDir: string
): Promise<{ text: string; language?: string; chunks: AudioChunkResult[]; warnings: string[] }> {
  const warnings: string[] = [];
  const segments = await splitAudioIfNeeded(audioPath, tempDir);
  if (segments.length > 1) {
    warnings.push("Audio exceeded 25 MB after compression and was transcribed in chunks.");
  }

  const chunks: AudioChunkResult[] = [];
  let language: string | undefined;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const upload = await toFile(await readFile(segment.path), path.basename(segment.path));
    const transcript = await client.audio.transcriptions.create({
      file: upload,
      model
    });

    const text = (transcript.text ?? "").trim();
    if (!text) {
      warnings.push(`Chunk ${index + 1} produced an empty transcript.`);
    }

    const transcriptLanguage = "language" in transcript && typeof transcript.language === "string"
      ? transcript.language.trim()
      : "";
    if (!language && transcriptLanguage) {
      language = transcriptLanguage;
    }

    chunks.push({
      index,
      path: segment.path,
      startSec: segment.startSec,
      endSec: segment.endSec,
      bytes: segment.bytes,
      text
    });
  }

  return {
    text: chunks.map((chunk) => chunk.text).filter(Boolean).join("\n\n").trim(),
    language,
    chunks,
    warnings
  };
}

async function extractVideoText(
  client: OpenAI,
  inputPath: string,
  fps: number,
  model: string,
  tempDir: string
): Promise<{ spans: VideoTextSpan[]; warnings: string[] }> {
  const framesDir = path.join(tempDir, "frames");
  const framePaths = await extractFrames(inputPath, fps, framesDir);
  const frameDurationSec = 1 / fps;
  const warnings: string[] = [];
  const spans: VideoTextSpan[] = [];

  for (let index = 0; index < framePaths.length; index += 1) {
    const framePath = framePaths[index];
    const buffer = await readFile(framePath);
    const base64 = buffer.toString("base64");
    const response = await client.responses.create({
      model,
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "Extract all readable on-screen text from this frame.",
              "Return strict JSON only: {\"text\":\"...\"}.",
              "Use an empty string when no readable text is present.",
              "Preserve line breaks for stacked captions."
            ].join(" ")
          },
          {
            type: "input_image",
            image_url: `data:image/jpeg;base64,${base64}`,
            detail: "high"
          }
        ]
      }]
    } as never);

    const raw = response.output_text?.trim() ?? "{\"text\":\"\"}";
    let text = "";
    try {
      text = parseOcrJson(raw);
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof ZodError) {
        warnings.push(`Frame ${index + 1} OCR output was not valid JSON and was discarded.`);
        continue;
      }
      throw error;
    }

    if (!text) {
      continue;
    }

    spans.push({
      startSec: index / fps,
      endSec: index / fps + frameDurationSec,
      text
    });
  }

  const deduped = dedupeVideoTextSpans(spans, frameDurationSec);
  if (deduped.length === 0) {
    warnings.push("Video OCR was enabled but no readable on-screen text was extracted.");
  }

  return { spans: deduped, warnings };
}

async function summarizeResult(
  client: OpenAI,
  model: string,
  payload: Record<string, unknown>
): Promise<SummaryResult> {
  const response = await client.responses.create({
    model,
    input: [{
      role: "user",
      content: [{
        type: "input_text",
        text: [
          "Summarize this transcript payload.",
          "Return strict JSON only with this shape:",
          "{\"summary\":\"...\",\"keyPoints\":[\"...\"]}.",
          "Keep the summary concise and focus on the main message."
        ].join(" ") + `\n\nPayload:\n${JSON.stringify(payload, null, 2)}`
      }]
    }]
  } as never);

  return parseSummaryJson(response.output_text ?? "{\"summary\":\"\",\"keyPoints\":[]}");
}

function buildArtifacts(resultBaseName: string, outDir: string, options: CliOptions): Artifacts {
  return {
    json: options.json ? path.join(outDir, `${resultBaseName}.json`) : undefined,
    text: options.text ? path.join(outDir, `${resultBaseName}.txt`) : undefined,
    summary: options.summary ? path.join(outDir, `${resultBaseName}.summary.txt`) : undefined
  };
}

export async function runPipeline(input: string, options: CliOptions): Promise<{ result: PipelineResult; stdout?: string }> {
  const apiKey = ensureApiKey();
  await ensureCommand("ffmpeg", "Install ffmpeg to extract audio and frames.");
  await ensureCommand("ffprobe", "Install ffmpeg/ffprobe to inspect media durations.");

  const client = new OpenAI({ apiKey });
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "vid2text-"));

  try {
    const resolved = await resolveInput(input, tempDir);
    const durationSec = await getMediaDurationSec(resolved.path);
    const audioPath = path.join(tempDir, "audio", "input.mp3");
    await extractAudio(resolved.path, audioPath);

    const audioResult = await transcribeAudio(client, audioPath, options.audioModel, tempDir);
    const warnings = [...audioResult.warnings];
    const source: SourceInfo = {
      kind: resolved.kind,
      originalInput: input,
      resolvedPath: resolved.path,
      durationSec
    };

    let videoText: VideoTextSpan[] | undefined;
    if (options.videoText) {
      const videoResult = await extractVideoText(client, resolved.path, options.fps, options.visionModel, tempDir);
      videoText = videoResult.spans;
      warnings.push(...videoResult.warnings);
    }

    const merged = options.videoText ? buildMergedTimeline({
      text: audioResult.text,
      language: audioResult.language,
      chunks: audioResult.chunks
    }, videoText) : undefined;

    let summary: SummaryResult | undefined;
    if (options.summary) {
      summary = await summarizeResult(client, options.summaryModel, {
        source,
        audio: {
          text: audioResult.text,
          language: audioResult.language
        },
        videoText,
        merged
      });
      if (!summary.summary) {
        warnings.push("Summary generation returned an empty summary.");
      }
    }

    if (!audioResult.text) {
      warnings.push("Audio transcription returned no spoken text.");
    }

    const outputBaseName = path.parse(resolved.path).name;
    await mkdir(options.outDir, { recursive: true });
    const artifacts = buildArtifacts(outputBaseName, options.outDir, options);

    const result: PipelineResult = {
      source,
      options: {
        videoText: options.videoText,
        summary: options.summary,
        audioModel: options.audioModel,
        visionModel: options.videoText ? options.visionModel : undefined,
        summaryModel: options.summary ? options.summaryModel : undefined,
        fps: options.videoText ? options.fps : undefined
      },
      audio: {
        text: audioResult.text,
        language: audioResult.language,
        chunks: audioResult.chunks
      },
      videoText,
      merged,
      summary,
      artifacts,
      warnings
    };

    if (artifacts.json) {
      await writeFile(artifacts.json, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    }

    if (artifacts.text) {
      await writeFile(artifacts.text, renderTextTranscript(result.audio, result.videoText), "utf8");
    }

    if (artifacts.summary && result.summary) {
      await writeFile(artifacts.summary, renderSummaryText(result.summary), "utf8");
    }

    let stdout: string | undefined;
    if (options.stdout === "json") {
      stdout = `${JSON.stringify(result, null, 2)}\n`;
    } else if (options.stdout === "text") {
      stdout = renderTextTranscript(result.audio, result.videoText);
    } else if (options.stdout === "summary") {
      stdout = result.summary ? renderSummaryText(result.summary) : "";
    }

    return { result, stdout };
  } finally {
    if (!options.keepTemp) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
