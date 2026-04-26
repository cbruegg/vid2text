#!/usr/bin/env bun
const target = process.env.TARGET || `bun-${process.platform}-${process.arch}`;
const outdir = process.env.OUTDIR || "./dist/bin";

// Auto-name with target if no explicit name given
let name = process.env.BIN_NAME;
if (!name) {
  name = `vid2text-${target}${target.includes("windows") ? ".exe" : ""}`;
}
const outfile = `${outdir}/${name}`;

const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  compile: {
    target: target as any,
    outfile,
  },
  minify: true,
});

if (!result.success) {
  console.error("Build failed");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(`Built: ${result.outputs[0]!.path}`);
