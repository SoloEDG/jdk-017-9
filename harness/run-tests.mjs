#!/usr/bin/env node
// Builds and runs the print regression suite without a browser.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, ".build");
mkdirSync(outDir, { recursive: true });

const suites = [
  { file: "geometry.test.mjs", needsCanvas: false },
  { file: "export.test.mjs", needsCanvas: true },
  { file: "ui.test.mjs", needsCanvas: true, needsJsdom: true },
];

// Components must be compiled through Vite, so the UI suite is bundled first.
if (process.argv.includes("--ui")) {
  const vite = spawnSync(
    "npx",
    ["vite", "build", "--config", path.join(here, "vite.ui.config.ts")],
    { stdio: "inherit", cwd: path.resolve(here, "..") },
  );
  if (vite.status !== 0) process.exit(vite.status ?? 1);
}

let failed = false;
for (const suite of suites) {
  if (suite.needsCanvas) {
    try {
      await import("@napi-rs/canvas");
    } catch {
      console.log(`SKIP ${suite.file} (@napi-rs/canvas not installed)`);
      continue;
    }
  }
  const runFrom = suite.needsJsdom
    ? path.join(here, "ui-dist", "ui-test.js")
    : path.join(outDir, suite.file.replace(/\.m?js$/, ".mjs"));
  if (suite.needsJsdom) {
    try {
      await import("jsdom");
    } catch {
      console.log(`SKIP ${suite.file} (jsdom not installed)`);
      continue;
    }
  } else {
    await build({
      entryPoints: [path.join(here, "tests", suite.file)],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node20",
      outfile: runFrom,
      external: ["@napi-rs/canvas"],
      logLevel: "silent",
    });
  }
  const run = spawnSync(process.execPath, [runFrom], {
    stdio: "inherit",
    cwd: path.resolve(here, ".."),
  });
  if (run.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
