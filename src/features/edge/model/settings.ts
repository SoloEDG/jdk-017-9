import type { Edge } from "../../../shared/types";
import { clamp } from "../../../shared/math";
export function setSeam(edge: Edge, value: number) {
  edge.seam = clamp(value, 0, 0.15);
}
export function setFeather(edge: Edge, value: number) {
  edge.feather = clamp(value, 0, 0.4);
}
export function setBackground(edge: Edge, value: string) {
  if (/^#[0-9a-f]{6}$/i.test(value)) edge.background = value;
}
