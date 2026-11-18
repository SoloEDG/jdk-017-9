import type { Projection, Edge } from "./types";
export const defaultProjection = (): Projection => ({
  mode: "planet",
  zoom: 1,
  yaw: 0,
  pitch: 0,
  roll: 0,
});
export const defaultEdge = (): Edge => ({
  seam: 0.025,
  feather: 0,
  background: "#e9eff4",
  transparent: false,
});
