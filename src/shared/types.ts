export interface Projection {
  mode: "planet" | "tunnel";
  zoom: number;
  yaw: number;
  pitch: number;
  roll: number;
}
export interface Edge {
  seam: number;
  feather: number;
  background: string;
  transparent: boolean;
}
export interface Asset {
  id: string;
  name: string;
  width: number;
  height: number;
  data: ImageData;
  thumbnail: string;
}
export interface StudioDocument {
  asset: Asset | null;
  projection: Projection;
  edge: Edge;
}
export interface ExportSettings {
  size: number;
  format: "png" | "jpeg";
  quality: number;
}
export interface RenderSnapshot {
  asset: Asset;
  projection: Projection;
  edge: Edge;
}
