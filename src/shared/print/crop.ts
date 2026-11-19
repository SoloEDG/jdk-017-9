import type { PrintFrame } from "../types";
import { clamp } from "../math";

export interface FrameCropWindow {
  /** Normalised centre of the crop inside the composition. */
  u: number;
  v: number;
  width: number;
  height: number;
}

export function frameCropWindow(frame: PrintFrame): FrameCropWindow {
  const aspect = frame.widthMm / Math.max(0.001, frame.heightMm);
  const zoom = clamp(frame.crop.zoom, 1, 8);
  const baseW = Math.min(1, aspect);
  const baseH = Math.min(1, 1 / aspect);
  const width = Math.min(1, baseW / zoom);
  const height = Math.min(1, baseH / zoom);
  const minU = width / 2;
  const maxU = 1 - width / 2;
  const minV = height / 2;
  const maxV = 1 - height / 2;
  return {
    u: clamp(0.5 + frame.crop.centerX, minU, maxU),
    v: clamp(0.5 + frame.crop.centerY, minV, maxV),
    width,
    height,
  };
}

export function cropPanLimits(frame: PrintFrame) {
  const crop = frameCropWindow(frame);
  return {
    maxX: (1 - crop.width) / 2,
    maxY: (1 - crop.height) / 2,
  };
}

export function panCrop(frame: PrintFrame, dxMm: number, dyMm: number) {
  const crop = frameCropWindow(frame);
  const limits = cropPanLimits(frame);
  frame.crop.centerX = clamp(
    frame.crop.centerX - (dxMm / frame.widthMm) * crop.width,
    -limits.maxX,
    limits.maxX,
  );
  frame.crop.centerY = clamp(
    frame.crop.centerY - (dyMm / frame.heightMm) * crop.height,
    -limits.maxY,
    limits.maxY,
  );
}

export function zoomCrop(frame: PrintFrame, zoom: number) {
  frame.crop.zoom = clamp(zoom, 1, 8);
  const limits = cropPanLimits(frame);
  frame.crop.centerX = clamp(frame.crop.centerX, -limits.maxX, limits.maxX);
  frame.crop.centerY = clamp(frame.crop.centerY, -limits.maxY, limits.maxY);
}

export function resetCrop(frame: PrintFrame) {
  frame.crop = { zoom: 1, centerX: 0, centerY: 0 };
}
