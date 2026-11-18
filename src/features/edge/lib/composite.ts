import type { Edge } from "../../../shared/types";
import { smoothstep } from "../../../shared/math";
export function applyEdge(
  rgba: number[],
  x: number,
  y: number,
  w: number,
  h: number,
  edge: Edge,
) {
  const radius = Math.hypot(x - w / 2, y - h / 2) / (Math.min(w, h) / 2);
  const fade =
    edge.feather > 0 ? 1 - smoothstep(1 - edge.feather, 1, radius) : 1;
  const a = (rgba[3] / 255) * fade;
  if (edge.transparent) return [rgba[0], rgba[1], rgba[2], a * 255];
  const bg = [1, 3, 5].map((i) =>
    parseInt(edge.background.slice(i, i + 2), 16),
  );
  return [
    rgba[0] * a + bg[0] * (1 - a),
    rgba[1] * a + bg[1] * (1 - a),
    rgba[2] * a + bg[2] * (1 - a),
    255,
  ];
}
