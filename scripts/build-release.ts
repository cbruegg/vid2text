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
  const name = `vid2text-${target}${target.includes("windows") ? ".exe" : ""}`;

  const result = await Bun.build({
    entrypoints: ["./src/index.ts"],
    compile: {
      target: target as any,
      outfile: `${outdir}/${name}`,
    },
    minify: true,
  });

  if (!result.success) {
    console.error(`Build failed for ${target}`);
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  console.log(`Built: ${result.outputs[0]!.path}`);
}

console.log("All builds completed");
