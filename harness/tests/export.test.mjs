// Export regressions. Needs @napi-rs/canvas for a DOM-free canvas; the runner
// skips this file when that optional dependency is unavailable.
import {
  createCanvas,
  ImageData as NodeImageData,
  loadImage,
} from "@napi-rs/canvas";
import path from "node:path";
import fs from "node:fs";
import { defaultPrintLayout } from "../../src/shared/print/defaults.ts";
import { pageGeometry, safeOverflowSides } from "../../src/shared/print/geometry.ts";
import { exportPrintPdf } from "../../src/features/print/lib/exportPdf.ts";
import { planCompositions } from "../../src/features/print/lib/plan.ts";
import {
  paintPage,
  pendingPreviewRenders,
} from "../../src/features/print/lib/preview.ts";

globalThis.ImageData = NodeImageData;
globalThis.document = {
  createElement(tag) {
    if (tag !== "canvas") throw new Error(`unsupported element ${tag}`);
    const canvas = createCanvas(1, 1);
    canvas.toBlob = (callback, type = "image/png", quality) => {
      // napi-rs takes JPEG quality as 0–100, the browser API as 0–1.
      const q =
        type === "image/jpeg" && quality !== undefined
          ? quality * 100
          : undefined;
      callback(new Blob([canvas.toBuffer(type, q)], { type }));
    };
    return canvas;
  },
};

const failures = [];
function check(name, condition, detail) {
  if (!condition) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${condition ? "PASS" : "FAIL"} ${name}`);
}

const panorama = await loadImage(
  path.join(process.cwd(), "public/panorama.jpg"),
);
const scratch = createCanvas(1200, 600);
scratch.getContext("2d").drawImage(panorama, 0, 0, 1200, 600);
const asset = {
  id: "test-asset",
  name: "test",
  width: 1200,
  height: 600,
  data: scratch.getContext("2d").getImageData(0, 0, 1200, 600),
  thumbnail: "",
};

const layout = defaultPrintLayout();
layout.dpi = 150;
layout.pageMode = "spread";
const composition = layout.compositions[0];
const base = layout.frames[0];
base.shape = "rect";
base.widthMm = 120;
base.heightMm = 80;
base.xMm = 12; // crosses the 210 mm fold of a 420 mm spread
base.yMm = 40;
base.cornerRadiusMm = 8;
base.crop = { zoom: 1.4, centerX: 0.05, centerY: 0 };
const bleedFrame = {
  ...base,
  id: "frame-bleed",
  name: "图框 02",
  xMm: 30,
  yMm: -10, // pokes into the bleed zone
  widthMm: 40,
  heightMm: 40,
  crop: { zoom: 2.5, centerX: -0.2, centerY: 0.1 },
};
layout.frames = [base, bleedFrame];

// One composition render serves every frame, sized in physical units.
const plans = planCompositions(layout, layout.frames, 150);
check("one raster per composition", plans.length === 1);
check(
  "raster side follows largest physical demand",
  plans[0].side >= Math.round((120 / 25.4) * 150) - 1,
  `side ${plans[0].side}`,
);
check(
  "plan is identical at any screen zoom",
  JSON.stringify(plans) ===
    JSON.stringify(planCompositions(layout, layout.frames, 150)),
);
check(
  "safe overflow detected in millimetres",
  safeOverflowSides(layout, bleedFrame).includes("上") &&
    safeOverflowSides(layout, base).length === 0,
);

const result = await exportPrintPdf({
  layout,
  asset,
  dpi: 150,
  bleedMode: "both",
  includeSafeGuide: true,
  quality: 0.92,
});
const bytes = Buffer.from(await result.blob.arrayBuffer());
fs.mkdirSync("test-output", { recursive: true });
fs.writeFileSync("test-output/print-test.pdf", bytes);

check("bleed and trim exported together", result.summaries.length === 2);
check(
  "both pages share one composition render",
  result.summaries.every((s) => s.compositionRenders === 1),
  JSON.stringify(result.summaries.map((s) => s.compositionRenders)),
);
check(
  "bleed page reserves bleed plus mark slug",
  Math.abs(
    result.summaries[0].mediaWidthMm -
      (result.summaries[0].trimWidthMm + 2 * (3 + 3 + 4 + 0.125)),
  ) < 1e-6,
);
check(
  "trim page is exactly the trim size",
  result.summaries[1].mediaWidthMm === result.summaries[1].trimWidthMm &&
    result.summaries[1].mediaHeightMm === result.summaries[1].trimHeightMm,
);

const text = bytes.toString("latin1");
check("PDF header", text.startsWith("%PDF-1.7"));
check("two page objects", (text.match(/\/Type \/Page /g) ?? []).length === 2);
check("vector crop marks present", (text.match(/ m /g) ?? []).length >= 8);
check("trim box exported", text.includes("/TrimBox"));
check("bleed box exported", text.includes("/BleedBox"));
check(
  "soft mask keeps feathered rims transparent",
  text.includes("/SMask"),
);
check(
  "xref table present",
  text.includes("\nxref\n") && text.trimEnd().endsWith("%%EOF"),
);

const pages = [...text.matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((m) =>
  m[1].split(/\s+/).map(Number),
);
const pageMm = pages.map((box) => [
  +(((box[2] - box[0]) / 72) * 25.4).toFixed(2),
  +(((box[3] - box[1]) / 72) * 25.4).toFixed(2),
]);
check(
  "media boxes match physical sheet plus bleed and marks",
  Math.abs(pageMm[0][0] - (420 + 2 * (3 + 3 + 4 + 0.125))) < 0.01 &&
    Math.abs(pageMm[0][1] - (297 + 2 * (3 + 3 + 4 + 0.125))) < 0.01 &&
    pageMm[1][0] === 420,
  JSON.stringify(pageMm),
);
check(
  "trim box on the bleed page equals the sheet",
  (() => {
    const trim = /\/TrimBox \[([^\]]+)\]/.exec(text);
    if (!trim) return false;
    const box = trim[1].split(/\s+/).map(Number);
    return (
      Math.abs(((box[2] - box[0]) / 72) * 25.4 - 420) < 0.01 &&
      Math.abs(((box[3] - box[1]) / 72) * 25.4 - 297) < 0.01
    );
  })(),
);

// Preview must place physical guides identically at every screen zoom.
const g = pageGeometry(layout, "bleed");
const cameraResults = [];
for (const ppmm of [1.2, 2.6, 5]) {
  const preview = createCanvas(
    Math.round(g.media.width * ppmm),
    Math.round(g.media.height * ppmm),
  );
  preview.style = {};
  const render = () =>
    paintPage(preview, {
      layout,
      asset,
      frames: layout.frames,
      geometry: g,
      variant: "bleed",
      ppmm,
      dpr: 1,
      widthCss: preview.width,
      heightCss: preview.height,
      selectedId: null,
      hoverId: null,
      affectedIds: [],
      showOutlines: false,
      showSafeGuides: true,
      resolveComposition: () => composition,
    });
  render();
  for (let i = 0; i < 600 && pendingPreviewRenders() > 0; i++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  render();
  const ctx = preview.getContext("2d");
  const y = Math.round((g.media.height / 2 - g.media.y) * ppmm);
  const row = ctx.getImageData(0, y, preview.width, 1).data;
  const expectedTrim = (g.sheet.x - g.media.x) * ppmm;
  const expectedRight = (g.sheet.x + g.sheet.width - g.media.x) * ppmm;
  // A 1 px stroke can be antialiased across two device pixels; accept the
  // darkest pixel within a small physical tolerance of the expected edge.
  const darkestNear = (target) => {
    let best = { x: -1, value: 999 };
    for (let dx = -3; dx <= 3; dx++) {
      const x = Math.round(target) + dx;
      if (x < 0 || x >= preview.width) continue;
      const i = x * 4;
      const value = Math.min(row[i], row[i + 1], row[i + 2]);
      if (value < best.value) best = { x, value };
    }
    return best;
  };
  const left = darkestNear(expectedTrim);
  const right = darkestNear(expectedRight);
  cameraResults.push({
    ppmm,
    left: left.x,
    right: right.x,
    expectedTrim: +expectedTrim.toFixed(2),
    expectedRight: +expectedRight.toFixed(2),
    found: left.value < 170 && right.value < 170,
  });
}
check(
  "trim guides land at the same physical position at every zoom",
  cameraResults.every(
    (r) =>
      r.found &&
      Math.abs(r.left - r.expectedTrim) <= 1.5 &&
      Math.abs(r.right - r.expectedRight) <= 1.5,
  ),
  JSON.stringify(cameraResults),
);

if (failures.length) {
  console.error(`\n${failures.length} export check(s) failed`);
  process.exit(1);
}
console.log("\nAll export checks passed");
