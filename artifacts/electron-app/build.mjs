import { build as esbuild } from "esbuild";
import { rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/main.ts")],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: path.resolve(distDir, "main.js"),
    external: ["electron"],
    logLevel: "info",
    target: "node20",
  });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/preload.ts")],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: path.resolve(distDir, "preload.js"),
    external: ["electron"],
    logLevel: "info",
    target: "node20",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
