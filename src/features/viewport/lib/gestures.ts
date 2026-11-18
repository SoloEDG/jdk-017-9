import type { Projection } from "../../../shared/types";
import { clamp, wrap } from "../../../shared/math";
export function dragView(
  start: Projection,
  dx: number,
  dy: number,
  extent: number,
): Partial<Projection> {
  return {
    yaw: wrap(start.yaw + (dx / extent) * 360, 360),
    pitch: clamp(start.pitch + (dy / extent) * 180, -85, 85),
  };
}
export function wheelZoom(zoom: number, delta: number) {
  return clamp(zoom * Math.exp(-clamp(delta, -150, 150) * 0.002), 0.3, 3);
}
