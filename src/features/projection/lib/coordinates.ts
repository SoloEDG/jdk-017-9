import type { Projection } from "../../../shared/types.ts";
import { radians, wrap, clamp } from "../../../shared/math.ts";
export function projectPoint(
  x: number,
  y: number,
  width: number,
  height: number,
  p: Projection,
) {
  const unit = Math.min(width, height) / 2;
  const a = (x - width / 2) / unit / p.zoom,
    b = (y - height / 2) / unit / p.zoom;
  const radius = Math.hypot(a, b);
  const theta = 2 * Math.atan(radius);
  const angle = Math.atan2(b, a) + radians(p.roll);
  let vx = Math.sin(theta) * Math.cos(angle),
    vy = Math.cos(theta) * (p.mode === "planet" ? -1 : 1),
    vz = Math.sin(theta) * Math.sin(angle);
  const tilt = radians(p.pitch);
  const rotatedY = vy * Math.cos(tilt) - vz * Math.sin(tilt);
  vz = vy * Math.sin(tilt) + vz * Math.cos(tilt);
  vy = rotatedY;
  return {
    u: wrap(Math.atan2(vz, vx) / (Math.PI * 2) + p.yaw / 360),
    v: clamp(0.5 - Math.asin(clamp(vy, -1, 1)) / Math.PI, 0, 1),
  };
}
