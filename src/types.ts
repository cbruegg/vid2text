export type StdoutTarget = "json" | "text" | "summary";

export interface CliOptions {
  videoText: boolean;
  outputSummary: boolean;
  outputJson: boolean;
  outputText: boolean;
  stdout?: StdoutTarget;
  outDir: string;
  audioModel: string;
  visionModel: string;
  summaryModel: string;
  fps: number;
  keepTemp: boolean;
}

export interface SourceInfo {
  kind: "url" | "file";
  originalInput: string;
  resolvedPath: string;
  durationSec: number;
}

export interface AudioChunkResult {
  index: number;
  path: string;
  startSec: number;
  endSec: number;
  bytes: number;
  text: string;
}

export interface AudioResult {
  text: string;
  language?: string;
  chunks: AudioChunkResult[];
}

export interface VideoTextSpan {
  startSec: number;
  endSec: number;
  text: string;
}

export interface TimelineEntry {
  source: "audio" | "videoText";
  startSec: number;
  endSec: number;
  text: string;
}

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
}

export interface Artifacts {
  json?: string;
  text?: string;
  summary?: string;
}

export interface PipelineResult {
  source: SourceInfo;
  options: {
    videoText: boolean;
    outputSummary: boolean;
    audioModel: string;
    visionModel?: string;
    summaryModel?: string;
    fps?: number;
  };
  audio: AudioResult;
  videoText?: VideoTextSpan[];
  merged?: TimelineEntry[];
  summary?: SummaryResult;
  artifacts: Artifacts;
  warnings: string[];
}
