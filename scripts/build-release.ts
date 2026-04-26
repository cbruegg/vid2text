#!/usr/bin/env bun
const outdir = process.env.OUTDIR || "./dist/bin";

const targets = [
  "bun-darwin-x64",
  "bun-darwin-arm64",
  "bun-linux-x64",
  "bun-linux-arm64",
  "bun-linux-x64-musl",
  "bun-linux-arm64-musl",
  "bun-windows-x64",
  "bun-windows-arm64",
];

for (const target of targets) {
  console.log(`Building ${target}...`);

  const proc = Bun.spawn({
    cmd: ["bun", "run", "scripts/build-executable.ts", "--target", target, "--outdir", outdir],
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    console.error(`Build failed for ${target}`);
    process.exit(exitCode);
  }
}

console.log("All builds completed");
