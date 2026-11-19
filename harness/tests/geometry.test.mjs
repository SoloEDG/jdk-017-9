// Pure geometry regressions: no DOM, no canvas.
import {
  pageGeometry,
  cropMarks,
  foldMarks,
  safeOverflowSides,
  framesUsingComposition,
  sourceEffectiveDpi,
  sheetWidthMm,
  mmToPt,
} from "../../src/shared/print/geometry.ts";
import {
  defaultPrintLayout,
  paperPresets,
} from "../../src/shared/print/defaults.ts";
import { frameCropWindow } from "../../src/shared/print/crop.ts";

const failures = [];
function check(name, condition, detail) {
  if (!condition) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${condition ? "PASS" : "FAIL"} ${name}`);
}

const layout = defaultPrintLayout();
const g = pageGeometry(layout, "bleed");
check("trim sheet is A4 portrait", g.sheet.width === 210 && g.sheet.height === 297);
check("bleed expands sheet by 3 mm", g.bleed.width === 216 && g.bleed.height === 303);
check(
  "media adds mark slug outside bleed",
  g.media.width === g.bleed.width + 2 * (3 + 4 + 0.125),
  `${g.media.width}`,
);
check("safe inset is 8 mm", g.safe.x === 8 && g.safe.width === 194);
check(
  "spread doubles width only",
  (() => {
    layout.pageMode = "spread";
    const spread = pageGeometry(layout, "bleed");
    const ok =
      spread.sheet.width === 420 &&
      spread.sheet.height === 297 &&
      spread.foldX === 210;
    layout.pageMode = "single";
    return ok;
  })(),
);

// Screen scale is not an input: geometry must be identical across cameras.
const again = pageGeometry(layout, "bleed");
check(
  "geometry is independent of screen zoom",
  JSON.stringify(g.media) === JSON.stringify(again.media),
);

// Crop marks start beyond the bleed edge and stay inside the media box.
const marks = cropMarks(layout);
check("crop marks emitted", marks.length === 8);
check(
  "crop marks clear the bleed",
  marks.every(
    (s) =>
      s.x1 < g.bleed.x + 1e-9 ||
      s.x1 > g.bleed.x + g.bleed.width - 1e-9 ||
      s.y1 < g.bleed.y + 1e-9 ||
      s.y1 > g.bleed.y + g.bleed.height - 1e-9,
  ),
);
check(
  "crop marks stay inside the media box",
  marks.every(
    (s) =>
      Math.min(s.x1, s.x2) >= g.media.x - 0.13 &&
      Math.max(s.x1, s.x2) <= g.media.x + g.media.width + 0.13 &&
      Math.min(s.y1, s.y2) >= g.media.y - 0.13 &&
      Math.max(s.y1, s.y2) <= g.media.y + g.media.height + 0.13,
  ),
);
check("no fold marks on a single page", foldMarks(layout).length === 0);
layout.pageMode = "spread";
check("fold marks appear only on spreads", foldMarks(layout).length === 2);
layout.pageMode = "single";

// Per-frame framing depends only on millimetres and saved crop.
const frame = layout.frames[0];
frame.widthMm = 90;
frame.heightMm = 90;
frame.crop = { zoom: 1, centerX: 0, centerY: 0 };
const crop = frameCropWindow(frame);
check(
  "crop covers a square frame",
  Math.abs(crop.width - 1) < 1e-9 && Math.abs(crop.height - 1) < 1e-9,
  JSON.stringify(crop),
);
frame.widthMm = 60;
frame.heightMm = 120;
const tall = frameCropWindow(frame);
check(
  "tall frame crops horizontally",
  Math.abs(tall.height - 1) < 1e-9 && Math.abs(tall.width - 0.5) < 1e-9,
  JSON.stringify(tall),
);
frame.crop = { zoom: 2, centerX: 0, centerY: 0 };
const zoomed = frameCropWindow(frame);
check(
  "crop zoom halves the window",
  Math.abs(zoomed.width - 0.25) < 1e-9,
  JSON.stringify(zoomed),
);
frame.crop = { zoom: 1, centerX: 99, centerY: 99 };
const clamped = frameCropWindow(frame);
check(
  "crop pan is clamped to the artwork",
  Math.abs(clamped.u - 0.75) < 1e-9 && Math.abs(clamped.v - 0.5) < 1e-9,
  JSON.stringify(clamped),
);

// Safe overflow is a millimetre test reused by preview and export.
frame.widthMm = 90;
frame.heightMm = 90;
frame.xMm = -5;
frame.yMm = 20;
check("frame outside safe zone flagged", safeOverflowSides(layout, frame).includes("左"));
frame.xMm = 20;
frame.yMm = 20;
check("frame inside safe zone", safeOverflowSides(layout, frame).length === 0);

// Frames sharing a composition are exactly the affected list.
const comp = layout.compositions[0];
layout.frames.push({ ...frame, id: "shared", name: "共享图框" });
check(
  "affected list covers every referencing frame",
  framesUsingComposition(layout, comp.id).length === 2,
);

// Source resolution is derived from physical frame size, not the screen.
const dpi = sourceEffectiveDpi(
  { width: 2400, height: 1200 },
  { ...frame, widthMm: 90, heightMm: 90 },
);
check(
  "source dpi is derived from millimetres",
  Math.abs(dpi - 2400 / 2 / (90 / 25.4)) < 0.01,
  `${dpi}`,
);

check(
  "every paper preset has millimetre dimensions",
  paperPresets.every((p) => p.widthMm >= 20 && p.heightMm >= 20),
);
check("pt conversion round-trips", Math.abs(mmToPt(25.4) - 72) < 1e-9);
check(
  "wide sheet width follows page mode",
  (() => {
    layout.paper = { ...paperPresets[2] };
    const single = sheetWidthMm(layout);
    layout.pageMode = "spread";
    const spread = sheetWidthMm(layout);
    layout.pageMode = "single";
    return single === 297 && spread === 594;
  })(),
);

if (failures.length) {
  console.error(`\n${failures.length} geometry check(s) failed`);
  process.exit(1);
}
console.log("\nAll geometry checks passed");
