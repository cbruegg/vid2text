#!/usr/bin/env bun
import process from "node:process";

function parseArgs(): { target?: string; outdir: string } {
  const args = process.argv.slice(2);
  let target: string | undefined;
  let outdir = "./dist/bin";

  for (let i = 0; i < args.length; i++) {
    const next = args[i + 1];
    if (args[i] === "--target" && next) {
      target = next;
      i++;
    } else if (args[i] === "--outdir" && next) {
      outdir = next;
      i++;
    }
  }

  return { target, outdir };
}

async function detectTarget(): Promise<string> {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "linux") {
    const muslFiles = [
      "/lib/ld-musl-x86_64.so.1",
      "/lib/ld-musl-aarch64.so.1",
    ];
    for (const file of muslFiles) {
      if (await Bun.file(file).exists()) {
        return `bun-linux-${arch}-musl`;
      }
    }
  }

  return `bun-${platform}-${arch}`;
}

async function main() {
  const { target: explicitTarget, outdir } = parseArgs();
  const target = explicitTarget || (await detectTarget());

  const name = `vid2text-${target}${target.includes("windows") ? ".exe" : ""}`;
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
}

main();
