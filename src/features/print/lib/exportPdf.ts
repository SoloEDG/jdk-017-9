import type {
  Asset,
  PrintComposition,
  PrintFrame,
  PrintLayout,
} from "../../../shared/types";
import {
  cropMarks,
  foldMarks,
  frameRect,
  intersects,
  mmToPt,
  pageGeometry,
  safeOverflowSides,
  sheetHeightMm,
  sheetWidthMm,
  type PageGeometry,
  type Rect,
} from "../../../shared/print/geometry";
import { frameCropWindow } from "../../../shared/print/crop";
import { planCompositions, pxFor, compositionOf } from "./plan";
import { renderRows } from "../../projection/lib/render";
import {
  buildPdf,
  type PdfPage,
  type PdfPageLine,
  type PdfPageText,
} from "./pdf";

export type ExportVariant = "bleed" | "trim";
export type BleedMode = "bleed" | "trim" | "both";

export interface ExportOptions {
  layout: PrintLayout;
  asset: Asset | null;
  dpi: number;
  bleedMode: BleedMode;
  includeSafeGuide: boolean;
  quality?: number;
  /** Cap for the shared composition raster; caps cost resolution, never repeat it. */
  maxCompositionSide?: number;
  onProgress?: (fraction: number, label: string) => void;
  signal?: AbortSignal;
}

export interface ExportSummary {
  variant: ExportVariant;
  mediaWidthMm: number;
  mediaHeightMm: number;
  trimWidthMm: number;
  trimHeightMm: number;
  dpi: number;
  compositionRenders: number;
  frameRenders: number;
  capped: boolean;
  maxSide: number;
  overflowFrames: string[];
}

export interface ExportResult {
  blob: Blob;
  summaries: ExportSummary[];
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function hexToUnit(hex: string): [number, number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return [1, 1, 1];
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function intersectRect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right - x <= 1e-6 || bottom - y <= 1e-6) return null;
  return { x, y, width: right - x, height: bottom - y };
}

async function renderComposition(
  asset: Asset,
  composition: PrintComposition,
  side: number,
  signal: AbortSignal | undefined,
  onStrip: () => void,
) {
  const size = Math.max(2, Math.round(side));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const strip = Math.max(16, Math.min(128, Math.floor(1_500_000 / size)));
  for (let y = 0; y < size; y += strip) {
    signal?.throwIfAborted();
    const end = Math.min(size, y + strip);
    const image = ctx.createImageData(size, end - y);
    renderRows(
      { asset, projection: composition.projection, edge: composition.edge },
      image,
      y,
      end,
      y,
      size,
    );
    ctx.putImageData(image, 0, y);
    onStrip();
    await tick();
  }
  return canvas;
}

/**
 * Draws the full frame (shape-clipped) once, then trims to the visible page.
 * The result keeps its alpha channel: the PDF carries it as a soft mask so the
 * page stock shows through the feathered rim instead of a baked-in colour.
 */
function composeFrameCanvas(
  source: HTMLCanvasElement,
  frame: PrintFrame,
  clip: Rect,
  dpi: number,
) {
  const frameWidth = pxFor(frame.widthMm, dpi);
  const frameHeight = pxFor(frame.heightMm, dpi);
  const full = document.createElement("canvas");
  full.width = frameWidth;
  full.height = frameHeight;
  const ctx = full.getContext("2d")!;
  ctx.clearRect(0, 0, frameWidth, frameHeight);
  ctx.save();
  ctx.beginPath();
  if (frame.shape === "circle") {
    ctx.ellipse(
      frameWidth / 2,
      frameHeight / 2,
      frameWidth / 2,
      frameHeight / 2,
      0,
      0,
      Math.PI * 2,
    );
  } else {
    ctx.roundRect(
      0,
      0,
      frameWidth,
      frameHeight,
      Math.min(
        frameWidth / 2,
        frameHeight / 2,
        (frame.cornerRadiusMm / frame.widthMm) * frameWidth,
      ),
    );
  }
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const crop = frameCropWindow(frame);
  const sourceSide = source.width;
  ctx.drawImage(
    source,
    (crop.u - crop.width / 2) * sourceSide,
    (crop.v - crop.height / 2) * sourceSide,
    crop.width * sourceSide,
    crop.height * sourceSide,
    0,
    0,
    frameWidth,
    frameHeight,
  );
  ctx.restore();

  const visible = intersectRect(frameRect(frame), clip);
  if (!visible) return null;
  const outWidth = pxFor(visible.width, dpi);
  const outHeight = pxFor(visible.height, dpi);
  const out = document.createElement("canvas");
  out.width = outWidth;
  out.height = outHeight;
  const outCtx = out.getContext("2d", { willReadFrequently: true })!;
  outCtx.clearRect(0, 0, outWidth, outHeight);
  const sx = ((visible.x - frame.xMm) / frame.widthMm) * frameWidth;
  const sy = ((visible.y - frame.yMm) / frame.heightMm) * frameHeight;
  const sw = (visible.width / frame.widthMm) * frameWidth;
  const sh = (visible.height / frame.heightMm) * frameHeight;
  outCtx.drawImage(full, sx, sy, sw, sh, 0, 0, outWidth, outHeight);
  return { canvas: out, visible, width: outWidth, height: outHeight };
}

function jpegBytes(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Uint8Array>((resolve, reject) =>
    canvas.toBlob(
      async (blob) => {
        if (!blob) return reject(new Error("PDF 图框编码失败"));
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      "image/jpeg",
      Math.min(1, Math.max(0.5, quality)),
    ),
  );
}

async function deflate(bytes: Uint8Array) {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Alpha becomes a PDF soft mask; fully opaque frames skip the extra stream. */
async function encodeFrame(canvas: HTMLCanvasElement, quality: number) {
  const data = await jpegBytes(canvas, quality);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let opaque = true;
  const alpha = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < alpha.length; i++) {
    const a = pixels[i * 4 + 3];
    alpha[i] = a;
    if (a !== 255) opaque = false;
  }
  return { data, mask: opaque ? undefined : await deflate(alpha) };
}

function pdfRect(rect: Rect, g: PageGeometry) {
  return {
    x: mmToPt(rect.x - g.media.x),
    y: mmToPt(g.media.height - (rect.y - g.media.y + rect.height)),
    width: mmToPt(rect.width),
    height: mmToPt(rect.height),
  };
}

function segmentsToLines(
  segments: { x1: number; y1: number; x2: number; y2: number }[],
  g: PageGeometry,
  widthPt: number,
): PdfPageLine[] {
  return segments.map((s) => ({
    x1: mmToPt(s.x1 - g.media.x),
    y1: mmToPt(g.media.height - (s.y1 - g.media.y)),
    x2: mmToPt(s.x2 - g.media.x),
    y2: mmToPt(g.media.height - (s.y2 - g.media.y)),
    width: widthPt,
    color: [0.08, 0.1, 0.09],
  }));
}

interface BuiltPage {
  page: PdfPage;
  summary: ExportSummary;
}

export interface PreparedRasters {
  dpi: number;
  rasters: Map<string, HTMLCanvasElement>;
  plans: ReturnType<typeof planCompositions>;
}

/**
 * Renders each referenced composition exactly once, at the largest size any
 * frame needs. Both export variants reuse these rasters, so asking for the
 * bleed and the trim page in one file does not re-render the artwork.
 */
export async function prepareRasters(
  options: ExportOptions,
  onStep: () => void = () => undefined,
): Promise<PreparedRasters> {
  const { layout, asset, signal } = options;
  const dpi = Math.max(72, Math.min(1200, Math.round(options.dpi)));
  if (!asset) throw new Error("请先导入一张全景照片");
  const maxSide = options.maxCompositionSide ?? 4096;
  const bleedClip = pageGeometry(layout, "bleed").bleed;
  const frames = layout.frames.filter(
    (frame) =>
      frame.widthMm > 0 &&
      frame.heightMm > 0 &&
      intersects(frameRect(frame), bleedClip),
  );
  const plans = planCompositions(layout, frames, dpi, maxSide);
  const rasters = new Map<string, HTMLCanvasElement>();
  for (const plan of plans) {
    signal?.throwIfAborted();
    rasters.set(
      plan.composition.id,
      await renderComposition(
        asset,
        plan.composition,
        plan.side,
        signal,
        onStep,
      ),
    );
  }
  return { dpi, rasters, plans };
}

async function buildPage(
  options: ExportOptions,
  variant: ExportVariant,
  prepared: PreparedRasters,
  onStep: () => void,
  report: (label: string) => void,
): Promise<BuiltPage> {
  const { layout, signal, includeSafeGuide, quality = 0.94 } = options;
  const dpi = prepared.dpi;
  const g = pageGeometry(layout, variant);
  const clip = variant === "bleed" ? g.bleed : g.sheet;
  const frames = layout.frames.filter(
    (frame) =>
      frame.widthMm > 0 &&
      frame.heightMm > 0 &&
      intersects(frameRect(frame), clip),
  );

  const page: PdfPage = {
    width: mmToPt(g.media.width),
    height: mmToPt(g.media.height),
    images: [],
    lines: [],
    rects: [],
    texts: [],
  };
  const mediaPx = pdfRect(g.media, g);
  if (variant === "bleed") {
    const bleedPx = pdfRect(g.bleed, g);
    page.trim = pdfRect(g.sheet, g);
    page.bleed = bleedPx;
    page.rects.push({ ...mediaPx, fill: [1, 1, 1] });
    page.rects.push({ ...bleedPx, fill: hexToUnit(layout.paperColor) });
  } else {
    page.rects.push({ ...mediaPx, fill: hexToUnit(layout.paperColor) });
    page.trim = pdfRect(g.sheet, g);
  }

  let frameRenders = 0;
  for (const frame of frames) {
    const composition = compositionOf(layout, frame);
    const source = prepared.rasters.get(composition.id);
    if (!source) continue;
    signal?.throwIfAborted();
    const extracted = composeFrameCanvas(source, frame, clip, dpi);
    if (!extracted) continue;
    const encoded = await encodeFrame(extracted.canvas, quality);
    const placed = pdfRect(extracted.visible, g);
    page.images.push({
      image: {
        width: extracted.width,
        height: extracted.height,
        data: encoded.data,
        mask: encoded.mask,
      },
      x: placed.x,
      y: placed.y,
      width: placed.width,
      height: placed.height,
    });
    frameRenders += 1;
    onStep();
    report("正在裁切图框与写印张");
    await tick();
  }

  if (variant === "bleed") {
    const strokePt = mmToPt(Math.max(0.1, layout.marks.strokeMm));
    page.lines.push(...segmentsToLines(cropMarks(layout), g, strokePt));
    page.lines.push(...segmentsToLines(foldMarks(layout), g, strokePt));
    const label = `ORBIT  ${sheetWidthMm(layout)} x ${sheetHeightMm(layout)} mm  ${dpi} dpi  bleed ${g.bleedMm} mm`;
    if (g.slugMm > 0) page.texts.push(slugText(label, g));
  }

  if (includeSafeGuide) {
    const safe = pdfRect(g.safe, g);
    page.rects.push({
      ...safe,
      stroke: [0.82, 0.54, 0.22],
      lineWidth: mmToPt(0.2),
      dash: [mmToPt(1.5), mmToPt(1.2)],
    });
    page.texts.push({
      text: `SAFE ${g.safeMm} mm`,
      x: safe.x + mmToPt(1),
      y: safe.y + safe.height - mmToPt(3.5),
      size: 6,
      color: [0.82, 0.54, 0.22],
    });
  }

  return {
    page,
    summary: {
      variant,
      mediaWidthMm: g.media.width,
      mediaHeightMm: g.media.height,
      trimWidthMm: g.sheet.width,
      trimHeightMm: g.sheet.height,
      dpi,
      compositionRenders: prepared.plans.length,
      frameRenders,
      capped: prepared.plans.some((plan) => plan.requestedSide > plan.side + 0.5),
      maxSide: Math.max(0, ...prepared.plans.map((plan) => plan.side)),
      overflowFrames: layout.frames
        .filter((frame) => safeOverflowSides(layout, frame).length > 0)
        .map((frame) => frame.name),
    },
  };
}

function slugText(text: string, g: PageGeometry): PdfPageText {
  return {
    text: text.replace(/[^\x20-\x7e]/g, "?"),
    x: mmToPt(1 - g.media.x + 0.6),
    y: mmToPt(3),
    size: mmToPt(2.2),
    color: [0.25, 0.28, 0.26],
  };
}

/**
 * Produces one PDF. With `bleedMode: "both"` the bleed page and the trim page
 * are two pages of the same file, sharing identical trim geometry and the same
 * composition rasters.
 */
export async function exportPrintPdf(
  options: ExportOptions,
): Promise<ExportResult> {
  const variants: ExportVariant[] =
    options.bleedMode === "both" ? ["bleed", "trim"] : [options.bleedMode];
  // Progress steps: one per frame per variant, plus raster strips and PDF assembly.
  const progress = {
    value: 0,
    total: Math.max(1, options.layout.frames.length * variants.length + 8),
  };
  const report = (label: string) =>
    options.onProgress?.(
      Math.min(0.97, progress.value / progress.total),
      label,
    );
  report("正在按物理尺寸渲染作品");
  const prepared = await prepareRasters(options, () => {
    progress.value += 1;
    report("正在按物理尺寸渲染作品");
  });

  const pages: PdfPage[] = [];
  const summaries: ExportSummary[] = [];
  for (const variant of variants) {
    options.signal?.throwIfAborted();
    const built = await buildPage(
      options,
      variant,
      prepared,
      () => {
        progress.value += 1;
      },
      (label) =>
        report(
          variants.length > 1
            ? `${label} · ${variant === "bleed" ? "带出血" : "成品尺寸"}`
            : label,
        ),
    );
    pages.push(built.page);
    summaries.push(built.summary);
  }
  options.signal?.throwIfAborted();
  report("正在封装 PDF");
  const blob = await buildPdf(pages, {
    title: "ORBIT print",
    subject: summaries
      .map(
        (s) =>
          `${s.variant} ${s.trimWidthMm}x${s.trimHeightMm}mm@${s.dpi}dpi`,
      )
      .join("; "),
  });
  options.onProgress?.(1, "PDF 已生成");
  return { blob, summaries };
}
