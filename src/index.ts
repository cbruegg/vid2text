#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { Command } from "commander";
import { UserError } from "./errors.js";
import { runPipeline } from "./pipeline.js";
import type { CliOptions, StdoutTarget } from "./types.js";

function parseYesNo(value: string): boolean {
  const lower = value.trim().toLowerCase();
  if (lower === "yes" || lower === "true" || lower === "1") return true;
  if (lower === "no" || lower === "false" || lower === "0") return false;
  throw new UserError(`Invalid yes/no value: ${value}. Use yes or no.`);
}

function buildProgram(): Command {
  const program = new Command();

  program
    .name("vid2text")
    .argument("<input>", "Public Reel URL or local media file path")
    .description("Transcribe spoken audio from Reels or local video files, with optional frame OCR and summary generation.")
    .option("--video-text", "Extract readable on-screen text from sampled frames", false)
    .option("--output-json <yes|no>", "Write JSON output", parseYesNo, true)
    .option("--output-text <yes|no>", "Write readable transcript text", parseYesNo, true)
    .option("--output-summary <yes|no>", "Generate and write summary", parseYesNo, false)
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

  if (stdout === "summary" && !raw.outputSummary) {
    throw new UserError("--stdout summary requires --output-summary yes.");
  }

  if (!raw.outputJson && !raw.outputText && !stdout) {
    throw new UserError("No output selected. Enable --output-json, --output-text, or --stdout.");
  }

  return {
    videoText: Boolean(raw.videoText),
    outputSummary: Boolean(raw.outputSummary),
    outputJson: Boolean(raw.outputJson),
    outputText: Boolean(raw.outputText),
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
  if (!input) {
    throw new UserError("Input is required.");
  }
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
