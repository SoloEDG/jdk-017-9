import type { PrintFrame, PrintLayout, PrintComposition } from "../../../shared/types";
import { frameCropWindow } from "../../../shared/print/crop";

export interface CompositionPlan {
  composition: PrintComposition;
  /** Pixel side of the single shared raster for this composition. */
  side: number;
  /** Largest side any referencing frame actually needs at this dpi. */
  requestedSide: number;
  frameIds: string[];
}

export const MAX_COMPOSITION_SIDE = 4096;
/** Working-memory ceiling for all shared composition rasters in one export. */
export const COMPOSITION_BUDGET_BYTES = 256 * 1024 * 1024;

export function compositionOf(layout: PrintLayout, frame: PrintFrame) {
  return (
    layout.compositions.find((c) => c.id === frame.compositionId) ??
    layout.compositions[0]
  );
}

export function pxFor(mm: number, dpi: number) {
  return Math.max(1, Math.round((mm / 25.4) * dpi));
}

/**
 * One raster per referenced artwork, sized by the largest physical demand of
 * any frame that uses it. Frames never trigger a second render of the same
 * composition, no matter how many crops or placements share it.
 */
export function planCompositions(
  layout: PrintLayout,
  frames: PrintFrame[],
  dpi: number,
  maxSide = MAX_COMPOSITION_SIDE,
  budgetBytes = COMPOSITION_BUDGET_BYTES,
): CompositionPlan[] {
  const map = new Map<string, CompositionPlan>();
  for (const frame of frames) {
    if (frame.widthMm <= 0 || frame.heightMm <= 0) continue;
    const composition = compositionOf(layout, frame);
    const crop = frameCropWindow(frame);
    const required = Math.max(
      pxFor(frame.widthMm, dpi) / crop.width,
      pxFor(frame.heightMm, dpi) / crop.height,
    );
    const existing = map.get(composition.id);
    if (existing) {
      existing.requestedSide = Math.max(existing.requestedSide, required);
      existing.frameIds.push(frame.id);
    } else {
      map.set(composition.id, {
        composition,
        side: 0,
        requestedSide: required,
        frameIds: [frame.id],
      });
    }
  }
  const plans = [...map.values()];
  for (const plan of plans) {
    plan.side = Math.min(Math.max(2, maxSide), Math.ceil(plan.requestedSide));
  }
  // Only when several artworks together exceed the budget do we trade
  // resolution for memory. Artwork is still rendered once per composition.
  let total = 0;
  for (const plan of plans) total += plan.side * plan.side * 4;
  if (total > budgetBytes && total > 0) {
    const scale = Math.sqrt(budgetBytes / total);
    for (const plan of plans)
      plan.side = Math.max(2, Math.floor(plan.side * scale));
  }
  return plans;
}

