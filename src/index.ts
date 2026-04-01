#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { Command } from "commander";
import { UserError } from "./errors.js";
import { runPipeline } from "./pipeline.js";
import type { CliOptions, StdoutTarget } from "./types.js";

function buildProgram(): Command {
  const program = new Command();

  program
    .name("vid2text")
    .argument("<input>", "Public Reel URL or local media file path")
    .description("Transcribe spoken audio from Reels or local video files, with optional frame OCR and summary generation.")
    .option("--video-text", "Extract readable on-screen text from sampled frames", false)
    .option("--summary", "Generate a concise summary after transcription", false)
    .option("--json", "Write JSON output", true)
    .option("--no-json", "Skip writing JSON output")
    .option("--text", "Write readable transcript text", true)
    .option("--no-text", "Skip writing transcript text")
    .option("--stdout <target>", "Print one artifact to stdout: json, text, or summary")
    .option("--out-dir <dir>", "Directory for output artifacts", path.resolve(process.cwd(), "output"))
    .option("--audio-model <model>", "Speech-to-text model", "gpt-4o-mini-transcribe")
    .option("--vision-model <model>", "Vision model for frame OCR", "gpt-4.1-mini")
    .option("--summary-model <model>", "Model for summary generation", "gpt-4.1-mini")
    .option("--fps <fps>", "Frame sampling rate when --video-text is enabled", parseFps, 1)
    .option("--keep-temp", "Keep intermediate working files", false);

  return program;
}

function parseFps(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new UserError(`Invalid fps value: ${value}`);
  }
  return parsed;
}

function normalizeOptions(raw: Record<string, unknown>): CliOptions {
  const stdout = raw.stdout as StdoutTarget | undefined;
  if (stdout && !["json", "text", "summary"].includes(stdout)) {
    throw new UserError(`Invalid --stdout target: ${stdout}`);
  }

  if (stdout === "summary" && !raw.summary) {
    throw new UserError("--stdout summary requires --summary.");
  }

  if (!raw.json && !raw.text && !stdout) {
    throw new UserError("No output selected. Enable --json, --text, or --stdout.");
  }

  return {
    videoText: Boolean(raw.videoText),
    summary: Boolean(raw.summary),
    json: Boolean(raw.json),
    text: Boolean(raw.text),
    stdout,
    outDir: path.resolve(String(raw.outDir)),
    audioModel: String(raw.audioModel),
    visionModel: String(raw.visionModel),
    summaryModel: String(raw.summaryModel),
    fps: Number(raw.fps),
    keepTemp: Boolean(raw.keepTemp)
  };
}

async function main(): Promise<void> {
  const program = buildProgram();
  program.parse(process.argv);

  const input = program.args[0];
  const options = normalizeOptions(program.opts<Record<string, unknown>>());
  const { stdout } = await runPipeline(input, options);

  if (stdout) {
    process.stdout.write(stdout);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof UserError || error instanceof Error
    ? error.message
    : "Unknown error";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
