import type {
  Asset,
  PrintComposition,
  PrintFrame,
  PrintLayout,
} from "../../../shared/types";
import type {
  PageGeometry,
  PreviewVariant,
} from "../../../shared/print/geometry";
import {
  cropMarks,
  foldMarks,
  frameRect,
  intersects,
  safeOverflowSides,
} from "../../../shared/print/geometry";
import { frameCropWindow } from "../../../shared/print/crop";
import { renderRows } from "../../projection/lib/render";

const PREVIEW_MAX_SIDE = 2048;
const PREVIEW_MIN_SIDE = 128;
const CACHE_BUDGET = 64 * 1024 * 1024;

interface PreviewEntry {
  canvas: HTMLCanvasElement;
  side: number;
  ready: boolean;
  usedAt: number;
  bytes: number;
}

const cache = new Map<string, PreviewEntry>();
const inFlight = new Set<string>();
let clock = 0;
const listeners = new Set<() => void>();
const busyListeners = new Set<(count: number) => void>();

export function onPreviewReady(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
/** Reports how many composition rasters are currently being prepared. */
export function onPreviewBusy(callback: (count: number) => void) {
  busyListeners.add(callback);
  callback(inFlight.size);
  return () => {
    busyListeners.delete(callback);
  };
}
function notifyBusy() {
  for (const listener of busyListeners) listener(inFlight.size);
}
function notify() {
  for (const listener of listeners) listener();
}

export function previewSignature(asset: Asset, composition: PrintComposition) {
  return JSON.stringify({
    asset: asset.id,
    projection: composition.projection,
    edge: composition.edge,
    revision: composition.revision,
  });
}

export function bucketSide(need: number) {
  const clamped = Math.max(PREVIEW_MIN_SIDE, Math.min(PREVIEW_MAX_SIDE, need));
  return 2 ** Math.ceil(Math.log2(clamped));
}

function evict() {
  let total = 0;
  for (const entry of cache.values()) total += entry.bytes;
  if (total <= CACHE_BUDGET) return;
  const sorted = [...cache.entries()].sort(
    (a, b) => a[1].usedAt - b[1].usedAt,
  );
  for (const [key, entry] of sorted) {
    if (total <= CACHE_BUDGET * 0.7) break;
    cache.delete(key);
    total -= entry.bytes;
  }
}

function schedule(
  asset: Asset,
  composition: PrintComposition,
  side: number,
  key: string,
) {
  if (cache.has(key) || inFlight.has(key)) return;
  inFlight.add(key);
  notifyBusy();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = side;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const entry: PreviewEntry = {
    canvas,
    side,
    ready: false,
    usedAt: ++clock,
    bytes: side * side * 4,
  };
  cache.set(key, entry);
  evict();
  const strip = Math.max(16, Math.min(96, Math.floor(300_000 / side)));
  let y = 0;
  const run = () => {
    if (!cache.has(key)) return;
    const end = Math.min(side, y + strip);
    const image = ctx.createImageData(side, end - y);
    renderRows(
      { asset, projection: composition.projection, edge: composition.edge },
      image,
      y,
      end,
      y,
      side,
    );
    ctx.putImageData(image, 0, y);
    y = end;
    if (y < side) setTimeout(run, 0);
    else {
      entry.ready = true;
      entry.usedAt = ++clock;
      inFlight.delete(key);
      notifyBusy();
      notify();
    }
  };
  setTimeout(run, 0);
}

/**
 * Returns the sharpest ready raster for this composition and schedules a
 * higher-resolution one if the current screen needs it. Frames sharing the
 * composition share these rasters.
 */
export function compositionPreview(
  asset: Asset,
  composition: PrintComposition,
  needSide: number,
) {
  const base = previewSignature(asset, composition);
  const want = bucketSide(needSide);
  let atLeast: PreviewEntry | null = null;
  let largest: PreviewEntry | null = null;
  for (const [key, entry] of cache) {
    if (!entry.ready || !key.startsWith(`${base}::`)) continue;
    if (!largest || entry.side > largest.side) largest = entry;
    if (entry.side >= want && (!atLeast || entry.side < atLeast.side))
      atLeast = entry;
  }
  const chosen = atLeast ?? largest;
  if (!atLeast) schedule(asset, composition, want, `${base}::${want}`);
  if (chosen) chosen.usedAt = ++clock;
  return {
    canvas: chosen?.canvas ?? null,
    ready: Boolean(atLeast && atLeast.side >= want),
  };
}

export function pendingPreviewRenders() {
  return inFlight.size;
}

export function clearPreviewCache() {
  cache.clear();
  inFlight.clear();
  notifyBusy();
}

export interface PaintOptions {
  layout: PrintLayout;
  asset: Asset | null;
  frames: PrintFrame[];
  geometry: PageGeometry;
  variant: PreviewVariant;
  /** CSS pixels per millimetre. Screen zoom changes only this multiplier. */
  ppmm: number;
  dpr: number;
  widthCss: number;
  heightCss: number;
  selectedId: string | null;
  hoverId: string | null;
  affectedIds: string[];
  showOutlines: boolean;
  showSafeGuides: boolean;
  resolveComposition: (frame: PrintFrame) => PrintComposition;
}

export const GUIDE_COLORS = {
  trim: "#27302d",
  bleed: "#3f6fbe",
  safe: "#c07d2c",
  fold: "#7d62c9",
  mark: "#141a16",
  selected: "#337d60",
  hover: "#7da78c",
  affected: "#bd5636",
  outline: "rgba(82,98,86,0.4)",
};

function mmRect(
  rect: { x: number; y: number; width: number; height: number },
  origin: { x: number; y: number },
  ppmm: number,
) {
  return {
    x: (rect.x - origin.x) * ppmm,
    y: (rect.y - origin.y) * ppmm,
    width: rect.width * ppmm,
    height: rect.height * ppmm,
  };
}

function framePath(
  ctx: CanvasRenderingContext2D,
  frame: PrintFrame,
  px: { x: number; y: number; width: number; height: number },
  ppmm: number,
) {
  ctx.beginPath();
  if (frame.shape === "circle") {
    ctx.ellipse(
      px.x + px.width / 2,
      px.y + px.height / 2,
      px.width / 2,
      px.height / 2,
      0,
      0,
      Math.PI * 2,
    );
  } else if (frame.cornerRadiusMm > 0) {
    ctx.roundRect(px.x, px.y, px.width, px.height, frame.cornerRadiusMm * ppmm);
  } else {
    ctx.rect(px.x, px.y, px.width, px.height);
  }
}

/**
 * Paints the sheet. Every boundary derives from `geometry` in millimetres, so
 * guides stay locked to the paper while `ppmm` (screen zoom) changes.
 */
export function paintPage(canvas: HTMLCanvasElement, opts: PaintOptions) {
  const { geometry: g, ppmm, dpr } = opts;
  const widthCss = Math.max(1, opts.widthCss);
  const heightCss = Math.max(1, opts.heightCss);
  const pixelWidth = Math.round(widthCss * dpr);
  const pixelHeight = Math.round(heightCss * dpr);
  // Assigning width/height always clears the bitmap, so only do it on resize.
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  canvas.style.width = `${widthCss}px`;
  canvas.style.height = `${heightCss}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, widthCss, heightCss);
  ctx.fillStyle = "#f1f3ef";
  ctx.fillRect(0, 0, widthCss, heightCss);

  const origin = { x: g.media.x, y: g.media.y };
  const bleedPx = mmRect(g.bleed, origin, ppmm);
  const sheetPx = mmRect(g.sheet, origin, ppmm);
  const clipPx = g.variant === "bleed" ? bleedPx : sheetPx;

  // Paper stock. The mark slug outside bleed stays unprinted.
  ctx.fillStyle = opts.layout.paperColor;
  ctx.fillRect(clipPx.x, clipPx.y, clipPx.width, clipPx.height);

  ctx.save();
  ctx.beginPath();
  ctx.rect(clipPx.x, clipPx.y, clipPx.width, clipPx.height);
  ctx.clip();
  for (const frame of opts.frames) {
    const rect = frameRect(frame);
    if (!intersects(rect, g.variant === "bleed" ? g.bleed : g.sheet)) continue;
    const px = mmRect(rect, origin, ppmm);
    const composition = opts.resolveComposition(frame);
    const crop = frameCropWindow(frame);
    const need =
      Math.max(px.width / crop.width, px.height / crop.height) * dpr;
    const preview = opts.asset
      ? compositionPreview(opts.asset, composition, need)
      : { canvas: null, ready: false };
    ctx.save();
    framePath(ctx, frame, px, ppmm);
    ctx.clip();
    if (preview.canvas) {
      const source = preview.canvas.width;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        preview.canvas,
        (crop.u - crop.width / 2) * source,
        (crop.v - crop.height / 2) * source,
        crop.width * source,
        crop.height * source,
        px.x,
        px.y,
        px.width,
        px.height,
      );
    } else {
      ctx.fillStyle = "#e7ece5";
      ctx.fillRect(px.x, px.y, px.width, px.height);
    }
    ctx.restore();
  }
  ctx.restore();

  if (g.foldX !== null && g.variant === "bleed") {
    const x = (g.foldX - origin.x) * ppmm;
    ctx.save();
    ctx.strokeStyle = GUIDE_COLORS.fold;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, sheetPx.y);
    ctx.lineTo(x, sheetPx.y + sheetPx.height);
    ctx.stroke();
    ctx.restore();
  }

  if (g.variant === "bleed" && opts.layout.marks.enabled) {
    ctx.save();
    ctx.strokeStyle = GUIDE_COLORS.mark;
    ctx.lineWidth = Math.max(1, opts.layout.marks.strokeMm * ppmm);
    ctx.lineCap = "butt";
    for (const s of [...cropMarks(opts.layout), ...foldMarks(opts.layout)]) {
      ctx.beginPath();
      ctx.moveTo((s.x1 - origin.x) * ppmm, (s.y1 - origin.y) * ppmm);
      ctx.lineTo((s.x2 - origin.x) * ppmm, (s.y2 - origin.y) * ppmm);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();
  if (g.variant === "bleed" && g.bleedMm > 0) {
    ctx.strokeStyle = GUIDE_COLORS.bleed;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(
      bleedPx.x + 0.5,
      bleedPx.y + 0.5,
      bleedPx.width - 1,
      bleedPx.height - 1,
    );
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = GUIDE_COLORS.trim;
  ctx.strokeRect(
    sheetPx.x + 0.5,
    sheetPx.y + 0.5,
    sheetPx.width - 1,
    sheetPx.height - 1,
  );
  ctx.restore();

  if (opts.showSafeGuides) {
    const safe = mmRect(g.safe, origin, ppmm);
    ctx.save();
    ctx.strokeStyle = GUIDE_COLORS.safe;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(safe.x + 0.5, safe.y + 0.5, safe.width - 1, safe.height - 1);
    ctx.setLineDash([]);
    ctx.fillStyle = GUIDE_COLORS.safe;
    ctx.font = '9px "DM Sans", "Noto Sans SC", sans-serif';
    ctx.textBaseline = "bottom";
    ctx.fillText(
      `安全区 ${g.safeMm.toFixed(1)} mm`,
      safe.x + 4,
      Math.max(9, safe.y - 3),
    );
    ctx.restore();
  }

  if (opts.showOutlines) {
    for (const frame of opts.frames) {
      const px = mmRect(frameRect(frame), origin, ppmm);
      const selected = frame.id === opts.selectedId;
      const hovered = frame.id === opts.hoverId;
      const affected = opts.affectedIds.includes(frame.id);
      const overflow = safeOverflowSides(opts.layout, frame).length > 0;
      ctx.save();
      ctx.lineWidth = selected ? 2 : 1;
      ctx.setLineDash(selected || affected ? [] : [4, 3]);
      ctx.strokeStyle = affected
        ? GUIDE_COLORS.affected
        : selected
          ? GUIDE_COLORS.selected
          : hovered
            ? GUIDE_COLORS.hover
            : overflow
              ? "rgba(189,86,54,0.72)"
              : GUIDE_COLORS.outline;
      framePath(ctx, frame, px, ppmm);
      ctx.stroke();
      ctx.setLineDash([]);
      if (selected) {
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = GUIDE_COLORS.selected;
        ctx.lineWidth = 1.5;
        for (const [hx, hy] of [
          [px.x, px.y],
          [px.x + px.width, px.y],
          [px.x, px.y + px.height],
          [px.x + px.width, px.y + px.height],
        ]) {
          ctx.fillRect(hx - 3.5, hy - 3.5, 7, 7);
          ctx.strokeRect(hx - 3.5, hy - 3.5, 7, 7);
        }
      }
      if (selected || affected) {
        const label = affected ? `${frame.name} · 受影响` : frame.name;
        ctx.font = '600 10px "DM Sans", "Noto Sans SC", sans-serif';
        const labelWidth = ctx.measureText(label).width + 10;
        const labelY = Math.max(14, px.y - 6);
        ctx.fillStyle = affected ? GUIDE_COLORS.affected : GUIDE_COLORS.selected;
        ctx.beginPath();
        ctx.roundRect(px.x, labelY - 12, labelWidth, 16, 3);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.textBaseline = "middle";
        ctx.fillText(label, px.x + 5, labelY - 3.5);
      }
      ctx.restore();
    }
  }

  if (g.variant === "bleed" && g.slugMm > 0) {
    const media = mmRect(g.media, origin, ppmm);
    ctx.save();
    ctx.strokeStyle = "rgba(110,120,110,0.5)";
    ctx.setLineDash([2, 3]);
    ctx.strokeRect(media.x + 0.5, media.y + 0.5, media.width - 1, media.height - 1);
    ctx.restore();
  }
}
