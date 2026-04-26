# vid2text

Local TypeScript CLI for transcribing spoken audio from public Instagram Reels or local media files, with optional on-screen text extraction and summary generation via OpenAI APIs.

## Requirements

- Bun 1.3.13+
- `ffmpeg` and `ffprobe` on `PATH`
- `yt-dlp` on `PATH` for Reel URL input
- `OPENAI_API_KEY` set in the environment

## Install

```bash
bun install
```

## Development

```bash
bun start --help
bun run check
bun test
```

## Build Release Binaries

Build for the current platform:

```bash
bun run build:bin
```

Build all release targets:

```bash
bun run build:release
```

## Usage

Basic Reel transcription:

```bash
export OPENAI_API_KEY=your_key_here
./dist/bin/vid2text-bun-darwin-arm64 "https://www.instagram.com/reel/REEL_ID/"
```

Basic local file transcription:

```bash
./dist/bin/vid2text-bun-darwin-arm64 ./my-video.mp4
```

Enable frame OCR and summary generation:

```bash
./dist/bin/vid2text-bun-darwin-arm64 "https://www.instagram.com/reel/REEL_ID/" --video-text --summary
```

Print one artifact to stdout instead of just writing files:

```bash
./dist/bin/vid2text-bun-darwin-arm64 "https://www.instagram.com/reel/REEL_ID/" --stdout text --no-text
./dist/bin/vid2text-bun-darwin-arm64 "https://www.instagram.com/reel/REEL_ID/" --stdout json --no-json
./dist/bin/vid2text-bun-darwin-arm64 "https://www.instagram.com/reel/REEL_ID/" --summary --stdout summary
```

Write artifacts to a custom directory:

```bash
./dist/bin/vid2text-bun-darwin-arm64 ./my-video.mp4 --out-dir ./tmp-output
```

## Output

By default the CLI writes:

- `<basename>.json`
- `<basename>.txt`

If `--summary` is enabled, it also writes:

- `<basename>.summary.txt`

Default output directory:

```text
./output
```

## Options

```text
--video-text             Extract readable on-screen text from sampled frames
--summary                Generate a concise summary after transcription
--json / --no-json       Enable or disable JSON artifact output
--text / --no-text       Enable or disable text artifact output
--stdout <target>        Print one artifact: json, text, or summary
--out-dir <dir>          Directory for output artifacts
--audio-model <model>    Speech-to-text model, default: gpt-4o-mini-transcribe
--vision-model <model>   Vision model for OCR, default: gpt-4.1-mini
--summary-model <model>  Model for summary, default: gpt-4.1-mini
--fps <fps>              Frame sampling rate for OCR, default: 1
--keep-temp              Keep intermediate temp files
```

## Notes

- Public Reel URLs only in v1. Private/authenticated downloads are not implemented.
- If `yt-dlp`, `ffmpeg`, or `ffprobe` are missing, the CLI fails fast with a clear error.
- Audio transcription is enabled by default. Video OCR and summary are opt-in.
- If compressed audio still exceeds the OpenAI upload size limit, the CLI splits it into chunks and stitches the transcript together.
