import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { UserError } from "./errors.js";

const AUDIO_TARGET_BYTES = 24 * 1024 * 1024;
const AUDIO_LIMIT_BYTES = 25 * 1024 * 1024;

export interface AudioSegment {
  path: string;
  startSec: number;
  endSec: number;
  bytes: number;
}

export async function getMediaDurationSec(inputPath: string): Promise<number> {
  const { stdout } = await execa("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    inputPath
  ]);

  const value = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(value) || value <= 0) {
    throw new UserError(`Could not determine media duration for ${inputPath}`);
  }
  return value;
}

export async function extractAudio(inputPath: string, outputPath: string): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await execa("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "mp3",
    "-b:a",
    "48k",
    outputPath
  ]);
}

export async function splitAudioIfNeeded(audioPath: string, tempDir: string): Promise<AudioSegment[]> {
  const audioStats = await stat(audioPath);
  const durationSec = await getMediaDurationSec(audioPath);

  if (audioStats.size <= AUDIO_LIMIT_BYTES) {
    return [{
      path: audioPath,
      startSec: 0,
      endSec: durationSec,
      bytes: audioStats.size
    }];
  }

  const segmentCount = Math.ceil(audioStats.size / AUDIO_TARGET_BYTES);
  const baseSegmentDuration = durationSec / segmentCount;
  const overlapSec = 0.75;
  const segments: AudioSegment[] = [];

  for (let index = 0; index < segmentCount; index += 1) {
    const naturalStart = index * baseSegmentDuration;
    const naturalEnd = Math.min(durationSec, (index + 1) * baseSegmentDuration);
    const startSec = Math.max(0, naturalStart - (index === 0 ? 0 : overlapSec));
    const endSec = Math.min(durationSec, naturalEnd + (index === segmentCount - 1 ? 0 : overlapSec));
    const outPath = path.join(tempDir, `audio-chunk-${index + 1}.mp3`);

    await execa("ffmpeg", [
      "-y",
      "-ss",
      `${startSec}`,
      "-t",
      `${Math.max(0.1, endSec - startSec)}`,
      "-i",
      audioPath,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "mp3",
      "-b:a",
      "48k",
      outPath
    ]);

    const chunkStats = await stat(outPath);
    segments.push({
      path: outPath,
      startSec,
      endSec,
      bytes: chunkStats.size
    });
  }

  return segments;
}

export async function extractFrames(inputPath: string, fps: number, framesDir: string): Promise<string[]> {
  await mkdir(framesDir, { recursive: true });
  await execa("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-vf",
    `fps=${fps}`,
    "-q:v",
    "3",
    path.join(framesDir, "frame-%06d.jpg")
  ]);

  const files = await readdir(framesDir);
  return files
    .filter((file) => file.endsWith(".jpg"))
    .sort()
    .map((file) => path.join(framesDir, file));
}
