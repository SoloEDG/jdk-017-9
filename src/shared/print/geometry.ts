import type { PrintFrame, PrintLayout } from "../types";
import { clamp } from "../math";

export const MM_PER_INCH = 25.4;
export const POINTS_PER_INCH = 72;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type PreviewVariant = "bleed" | "trim";

export interface PageGeometry {
  /** Final trim sheet. For a spread this is the full spread, origin at 0,0. */
  sheet: Rect;
  bleed: Rect;
  media: Rect;
  safe: Rect;
  /** Width of one page; for a spread the sheet is twice this. */
  pageWidthMm: number;
  pageHeightMm: number;
  foldX: number | null;
  bleedMm: number;
  safeMm: number;
  /** Margin reserved outside bleed for crop marks. Zero in trim exports. */
  slugMm: number;
  variant: PreviewVariant;
}

export const mmToPt = (mm: number) => (mm * POINTS_PER_INCH) / MM_PER_INCH;

export function sheetWidthMm(layout: PrintLayout) {
  return layout.pageMode === "spread"
    ? layout.paper.widthMm * 2
    : layout.paper.widthMm;
}

export function sheetHeightMm(layout: PrintLayout) {
  return layout.paper.heightMm;
}

export function expandRect(r: Rect, by: number): Rect {
  return {
    x: r.x - by,
    y: r.y - by,
    width: r.width + by * 2,
    height: r.height + by * 2,
  };
}

export function insetRect(r: Rect, by: number): Rect {
  return expandRect(r, -by);
}

export function rectContains(outer: Rect, inner: Rect, epsilon = 1e-6) {
  return (
    inner.x >= outer.x - epsilon &&
    inner.y >= outer.y - epsilon &&
    inner.x + inner.width <= outer.x + outer.width + epsilon &&
    inner.y + inner.height <= outer.y + outer.height + epsilon
  );
}

export function intersects(a: Rect, b: Rect) {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

export function cropMarkSlugMm(layout: PrintLayout) {
  if (!layout.marks.enabled) return 0;
  return (
    layout.marks.offsetMm +
    layout.marks.lengthMm +
    layout.marks.strokeMm / 2
  );
}

/**
 * The single source of truth for every physical boundary shown in the editor
 * and emitted in PDFs. All values are millimetres. Screen zoom never enters
 * this function, which is what keeps guides fixed while the page is zoomed.
 */
export function pageGeometry(
  layout: PrintLayout,
  variant: PreviewVariant,
): PageGeometry {
  const width = sheetWidthMm(layout);
  const height = sheetHeightMm(layout);
  const sheet: Rect = { x: 0, y: 0, width, height };
  const bleedMm = variant === "bleed" ? Math.max(0, layout.bleedMm) : 0;
  const bleed = expandRect(sheet, bleedMm);
  const slugMm = variant === "bleed" ? cropMarkSlugMm(layout) : 0;
  const media = expandRect(bleed, slugMm);
  const safeMm = clamp(
    layout.safeMm,
    0,
    Math.min(width, height) / 2 - 0.01,
  );
  return {
    sheet,
    bleed,
    media,
    safe: insetRect(sheet, safeMm),
    pageWidthMm: layout.paper.widthMm,
    pageHeightMm: layout.paper.heightMm,
    foldX: layout.pageMode === "spread" ? layout.paper.widthMm : null,
    bleedMm,
    safeMm,
    slugMm,
    variant,
  };
}

export function frameRect(frame: PrintFrame): Rect {
  return {
    x: frame.xMm,
    y: frame.yMm,
    width: frame.widthMm,
    height: frame.heightMm,
  };
}

export function isFrameCrossPage(layout: PrintLayout, frame: PrintFrame) {
  if (layout.pageMode !== "spread") return false;
  const fold = layout.paper.widthMm;
  return frame.xMm < fold && frame.xMm + frame.widthMm > fold;
}

/**
 * Safe-zone overflow is measured on the frame's physical box. A frame that
 * extends past the safe boundary is flagged identically in preview and in the
 * exported PDF, where the boundary is drawn from `safe` above.
 */
export function safeOverflow(layout: PrintLayout, frames: PrintFrame[]) {
  const { safe } = pageGeometry(layout, "bleed");
  return frames.filter((frame) => !rectContains(safe, frameRect(frame)));
}

export function safeOverflowSides(layout: PrintLayout, frame: PrintFrame) {
  const { safe } = pageGeometry(layout, "bleed");
  const r = frameRect(frame);
  const sides: string[] = [];
  if (r.x < safe.x - 1e-6) sides.push("左");
  if (r.y < safe.y - 1e-6) sides.push("上");
  if (r.x + r.width > safe.x + safe.width + 1e-6) sides.push("右");
  if (r.y + r.height > safe.y + safe.height + 1e-6) sides.push("下");
  return sides;
}

export function outsideBleed(layout: PrintLayout, frame: PrintFrame) {
  const { bleed } = pageGeometry(layout, "bleed");
  return !rectContains(bleed, frameRect(frame), 1e-6);
}

/** Crop marks, in sheet mm, outside each trim corner. */
export function cropMarks(layout: PrintLayout): Segment[] {
  if (!layout.marks.enabled || layout.marks.offsetMm < 0) return [];
  const { bleed } = pageGeometry(layout, "bleed");
  const o = layout.marks.offsetMm;
  const len = layout.marks.lengthMm;
  // Marks sit clear of the bleed edge so they are not printed into the image.
  const left = bleed.x;
  const right = bleed.x + bleed.width;
  const top = bleed.y;
  const bottom = bleed.y + bleed.height;
  const segments: Segment[] = [];
  for (const [x, dir] of [
    [left, -1],
    [right, 1],
  ] as const) {
    segments.push({ x1: x + dir * o, y1: top, x2: x + dir * (o + len), y2: top });
    segments.push({
      x1: x + dir * o,
      y1: bottom,
      x2: x + dir * (o + len),
      y2: bottom,
    });
  }
  for (const [y, dir] of [
    [top, -1],
    [bottom, 1],
  ] as const) {
    segments.push({ x1: left, y1: y + dir * o, x2: left, y2: y + dir * (o + len) });
    segments.push({
      x1: right,
      y1: y + dir * o,
      x2: right,
      y2: y + dir * (o + len),
    });
  }
  return segments;
}

/** Fold ticks for a spread, drawn in the mark slug. They are vector in PDF. */
export function foldMarks(layout: PrintLayout): Segment[] {
  // Fold ticks live in the same slug as crop marks; without the slug they
  // would fall outside the MediaBox and be clipped away.
  if (layout.pageMode !== "spread" || !layout.marks.enabled) return [];
  const { bleed } = pageGeometry(layout, "bleed");
  const x = layout.paper.widthMm;
  const len = layout.marks.lengthMm;
  const o = layout.marks.offsetMm;
  return [
    { x1: x, y1: bleed.y - o, x2: x, y2: bleed.y - o - len },
    {
      x1: x,
      y1: bleed.y + bleed.height + o,
      x2: x,
      y2: bleed.y + bleed.height + o + len,
    },
  ];
}

/** Approximate source resolution available for the projection. */
export function sourceEffectiveDpi(
  asset: { width: number; height: number } | null,
  frame: PrintFrame,
) {
  if (!asset) return 0;
  const widthIn = frame.widthMm / MM_PER_INCH;
  const heightIn = frame.heightMm / MM_PER_INCH;
  // A 360° panorama spends half of its width on the visible hemisphere.
  return Math.min(asset.width / (2 * widthIn), asset.height / heightIn);
}

export function clampFrame(frame: PrintFrame, layout: PrintLayout) {
  const min = 5;
  frame.widthMm = clamp(frame.widthMm, min, 2000);
  frame.heightMm = clamp(frame.heightMm, min, 2000);
  frame.cornerRadiusMm = clamp(
    frame.cornerRadiusMm,
    0,
    Math.min(frame.widthMm, frame.heightMm) / 2,
  );
  frame.xMm = clamp(frame.xMm, -layout.bleedMm - 200, sheetWidthMm(layout) + 200);
  frame.yMm = clamp(
    frame.yMm,
    -layout.bleedMm - 200,
    sheetHeightMm(layout) + 200,
  );
}

export function setBleedMm(layout: PrintLayout, value: number) {
  layout.bleedMm = clamp(value, 0, 20);
}

export function setSafeMm(layout: PrintLayout, value: number) {
  layout.safeMm = clamp(
    value,
    0,
    Math.min(sheetWidthMm(layout), sheetHeightMm(layout)) / 2 - 1,
  );
}


/** Frames that would change when the referenced composition changes. */
export function framesUsingComposition(
  layout: PrintLayout,
  compositionId: string,
) {
  return layout.frames.filter((frame) => frame.compositionId === compositionId);
}

export interface StructureReport {
  id: string;
  text: string;
}

/** Physical checks surfaced next to the frame controls. */
export function structureReports(layout: PrintLayout): StructureReport[] {
  const reports: StructureReport[] = [];
  for (const frame of layout.frames) {
    const sides = safeOverflowSides(layout, frame);
    if (sides.length)
      reports.push({
        id: `safe-${frame.id}`,
        text: `${frame.name} 超出安全区（${sides.join("、")}）`,
      });
    if (outsideBleed(layout, frame))
      reports.push({
        id: `bleed-${frame.id}`,
        text: `${frame.name} 超出出血边界，裁切后会被切断`,
      });
    if (isFrameCrossPage(layout, frame))
      reports.push({
        id: `fold-${frame.id}`,
        text: `${frame.name} 跨过装订线，两页会看到不同取景`,
      });
  }
  return reports;
}

export function frameLabelSafe(layout: PrintLayout, frame: PrintFrame) {
  const composition =
    layout.compositions.find((c) => c.id === frame.compositionId)?.name ?? "—";
  return `${composition} · ${Math.round(frame.widthMm)}×${Math.round(frame.heightMm)} mm`;
}
