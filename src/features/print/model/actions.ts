import type {
  PrintComposition,
  PrintFrame,
  PrintLayout,
} from "../../../shared/types";
import {
  sheetHeightMm,
  sheetWidthMm,
} from "../../../shared/print/geometry";
import { clamp } from "../../../shared/math";

let counter = 0;
export function uid(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export function activeComposition(layout: PrintLayout): PrintComposition {
  return (
    layout.compositions.find((c) => c.id === layout.activeCompositionId) ??
    layout.compositions[0]
  );
}

export function activeFrame(layout: PrintLayout): PrintFrame | null {
  return (
    layout.frames.find((frame) => frame.id === layout.activeFrameId) ?? null
  );
}

export function compositionForFrame(
  layout: PrintLayout,
  frame: PrintFrame,
): PrintComposition {
  return (
    layout.compositions.find((c) => c.id === frame.compositionId) ??
    layout.compositions[0]
  );
}

export function addFrame(layout: PrintLayout, compositionId?: string) {
  const composition = compositionId
    ? (layout.compositions.find((c) => c.id === compositionId) ??
      layout.compositions[0])
    : activeComposition(layout);
  const width = Math.min(70, sheetWidthMm(layout) / 2);
  const offset = (layout.frames.length % 5) * 10;
  const frame: PrintFrame = {
    id: uid("frame"),
    name: `图框 ${String(layout.frames.length + 1).padStart(2, "0")}`,
    compositionId: composition.id,
    shape: "circle",
    widthMm: width,
    heightMm: width,
    cornerRadiusMm: 0,
    crop: { zoom: 1, centerX: 0, centerY: 0 },
    xMm: clamp(
      sheetWidthMm(layout) / 2 - width / 2 + offset - 20,
      -layout.bleedMm,
      sheetWidthMm(layout) - width + layout.bleedMm,
    ),
    yMm: clamp(
      sheetHeightMm(layout) / 2 - width / 2 + offset - 20,
      -layout.bleedMm,
      sheetHeightMm(layout) - width + layout.bleedMm,
    ),
  };
  layout.frames.push(frame);
  layout.activeFrameId = frame.id;
  return frame;
}

export function duplicateFrame(layout: PrintLayout, frameId: string) {
  const source = layout.frames.find((frame) => frame.id === frameId);
  if (!source) return null;
  const frame: PrintFrame = {
    ...source,
    id: uid("frame"),
    name: `${source.name} 副本`,
    crop: { ...source.crop },
    xMm: source.xMm + 12,
    yMm: source.yMm + 12,
  };
  layout.frames.push(frame);
  layout.activeFrameId = frame.id;
  return frame;
}

export function removeFrame(layout: PrintLayout, frameId: string) {
  const index = layout.frames.findIndex((frame) => frame.id === frameId);
  if (index < 0) return;
  layout.frames.splice(index, 1);
  if (layout.activeFrameId === frameId)
    layout.activeFrameId =
      layout.frames[index]?.id ?? layout.frames[index - 1]?.id ?? null;
}

export function newComposition(layout: PrintLayout): PrintComposition {
  return {
    id: uid("composition"),
    name: `构图 ${layout.compositions.length + 1}`,
    projection: { mode: "planet", zoom: 1, yaw: 0, pitch: 0, roll: 0 },
    edge: {
      seam: 0.025,
      feather: 0,
      background: "#e9eff4",
      transparent: false,
    },
    revision: 1,
  };
}
