import { z } from "zod";
import type { AudioResult, SummaryResult, TimelineEntry, VideoTextSpan } from "./types.js";

const ocrSchema = z.object({
  text: z.string().default("")
});

const summarySchema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()).default([])
});

export function normalizeVisibleText(text: string): string {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function parseOcrJson(raw: string): string {
  const parsed = ocrSchema.parse(JSON.parse(raw));
  return normalizeVisibleText(parsed.text);
}

export function parseSummaryJson(raw: string): SummaryResult {
  const parsed = summarySchema.parse(JSON.parse(raw));
  return {
    summary: parsed.summary.trim(),
    keyPoints: parsed.keyPoints.map((point) => point.trim()).filter(Boolean)
  };
}

export function dedupeVideoTextSpans(spans: VideoTextSpan[], frameDurationSec: number): VideoTextSpan[] {
  const deduped: VideoTextSpan[] = [];

  for (const span of spans) {
    const text = normalizeVisibleText(span.text);
    if (!text) {
      continue;
    }

    const previous = deduped.at(-1);
    if (previous && previous.text === text && span.startSec <= previous.endSec + frameDurationSec * 1.5) {
      previous.endSec = Math.max(previous.endSec, span.endSec);
      continue;
    }

    deduped.push({
      startSec: span.startSec,
      endSec: span.endSec,
      text
    });
  }

  return deduped;
}

export function buildMergedTimeline(audio: AudioResult, videoText?: VideoTextSpan[]): TimelineEntry[] {
  const merged: TimelineEntry[] = [];

  for (const chunk of audio.chunks) {
    const text = chunk.text.trim();
    if (!text) {
      continue;
    }

    merged.push({
      source: "audio",
      startSec: chunk.startSec,
      endSec: chunk.endSec,
      text
    });
  }

  for (const span of videoText ?? []) {
    merged.push({
      source: "videoText",
      startSec: span.startSec,
      endSec: span.endSec,
      text: span.text
    });
  }

  return merged.sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
}

export function renderTextTranscript(audio: AudioResult, videoText?: VideoTextSpan[]): string {
  const lines: string[] = ["# Spoken Transcript", "", audio.text.trim() || "[empty]"];

  if (videoText && videoText.length > 0) {
    lines.push("", "# On-Screen Text", "");
    for (const span of videoText) {
      lines.push(`[${span.startSec.toFixed(2)}-${span.endSec.toFixed(2)}] ${span.text}`);
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

export function renderSummaryText(summary: SummaryResult): string {
  const lines = [summary.summary.trim()];

  if (summary.keyPoints.length > 0) {
    lines.push("", "Key points:");
    for (const point of summary.keyPoints) {
      lines.push(`- ${point}`);
    }
  }

  return `${lines.join("\n").trim()}\n`;
}
