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

export type PrintPageMode = "single" | "spread";
export type FrameShape = "circle" | "rect";
export type BleedMode = "bleed" | "trim" | "both";

/** A shared, referenced artwork composition. Editing it updates every frame that uses it. */
export interface PrintComposition {
  id: string;
  name: string;
  projection: Projection;
  edge: Edge;
  revision: number;
}

/** Per-frame framing of a referenced composition. */
export interface PrintCrop {
  zoom: number;
  centerX: number;
  centerY: number;
}

export interface PrintFrame {
  id: string;
  name: string;
  compositionId: string;
  shape: FrameShape;
  /** Position and size are millimetres inside the trim sheet. */
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  cornerRadiusMm: number;
  crop: PrintCrop;
}

export interface PrintPaper {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
}

export interface PrintCropMarks {
  enabled: boolean;
  lengthMm: number;
  offsetMm: number;
  strokeMm: number;
}

export interface PrintLayout {
  paper: PrintPaper;
  pageMode: PrintPageMode;
  bleedMm: number;
  safeMm: number;
  dpi: number;
  paperColor: string;
  marks: PrintCropMarks;
  showSafeGuides: boolean;
  compositions: PrintComposition[];
  frames: PrintFrame[];
  activeFrameId: string | null;
  activeCompositionId: string | null;
  initialized: boolean;
}

export interface PrintExportSettings {
  dpi: number;
  bleedMode: BleedMode;
  includeSafeGuide: boolean;
}

export interface StudioActions {
  /** Applies a projection change to the live artwork and the active print composition. */
  setProjection: (patch: Partial<Projection>) => void;
  /** Applies an edge change to the live artwork and the active print composition. */
  setEdge: (patch: Partial<Edge>) => void;
}

export interface StudioDocument {
  asset: Asset | null;
  projection: Projection;
  edge: Edge;
  print: PrintLayout;
  actions: StudioActions;
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
