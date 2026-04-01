import { describe, expect, it } from "vitest";
import { buildMergedTimeline, dedupeVideoTextSpans, normalizeVisibleText, renderSummaryText } from "../src/text.js";

describe("normalizeVisibleText", () => {
  it("collapses empty lines and trims content", () => {
    expect(normalizeVisibleText("  Hello \n\n world  \n")).toBe("Hello\nworld");
  });
});

describe("dedupeVideoTextSpans", () => {
  it("merges adjacent identical captions", () => {
    const result = dedupeVideoTextSpans([
      { startSec: 0, endSec: 1, text: "Hello" },
      { startSec: 1, endSec: 2, text: "Hello" },
      { startSec: 2, endSec: 3, text: "World" }
    ], 1);

    expect(result).toEqual([
      { startSec: 0, endSec: 2, text: "Hello" },
      { startSec: 2, endSec: 3, text: "World" }
    ]);
  });
});

describe("buildMergedTimeline", () => {
  it("sorts audio and video text together by time", () => {
    const merged = buildMergedTimeline({
      text: "all audio",
      chunks: [
        { index: 0, path: "a.mp3", startSec: 5, endSec: 10, bytes: 1, text: "later" },
        { index: 1, path: "b.mp3", startSec: 0, endSec: 4, bytes: 1, text: "earlier" }
      ]
    }, [
      { startSec: 4.5, endSec: 5, text: "caption" }
    ]);

    expect(merged.map((entry) => entry.text)).toEqual(["earlier", "caption", "later"]);
  });
});

describe("renderSummaryText", () => {
  it("renders key points when present", () => {
    expect(renderSummaryText({
      summary: "Summary",
      keyPoints: ["One", "Two"]
    })).toContain("Key points:");
  });
});
