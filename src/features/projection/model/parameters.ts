import type { Projection } from "../../../shared/types";
import { clamp, wrap } from "../../../shared/math";
import { defaultProjection } from "../../../shared/defaults";
export function updateProjection(
  p: Projection,
  key: keyof Projection,
  value: number | string,
) {
  if (key === "mode") {
    p.mode = value === "tunnel" ? "tunnel" : "planet";
    return;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return;
  if (key === "zoom") p.zoom = clamp(n, 0.3, 3);
  if (key === "yaw" || key === "roll") p[key] = wrap(n, 360);
  if (key === "pitch") p.pitch = clamp(n, -85, 85);
}
export function resetProjection(p: Projection) {
  Object.assign(p, defaultProjection());
}
