import type {
  PrintComposition,
  PrintFrame,
  PrintLayout,
  PrintPaper,
} from "../types";

export const paperPresets: PrintPaper[] = [
  { id: "a4-portrait", name: "A4 纵向", widthMm: 210, heightMm: 297 },
  { id: "a4-landscape", name: "A4 横向", widthMm: 297, heightMm: 210 },
  { id: "a3-portrait", name: "A3 纵向", widthMm: 297, heightMm: 420 },
  { id: "a3-landscape", name: "A3 横向", widthMm: 420, heightMm: 297 },
  { id: "a5-portrait", name: "A5 纵向", widthMm: 148, heightMm: 210 },
  { id: "postcard", name: "明信片 100 × 150", widthMm: 100, heightMm: 150 },
  { id: "square", name: "方卡 140 × 140", widthMm: 140, heightMm: 140 },
];

export type PaperPresetId = (typeof paperPresets)[number]["id"];

export const dpiPresets = [150, 300, 600] as const;

export const defaultComposition = (): PrintComposition => ({
  id: "composition-main",
  name: "主构图",
  projection: {
    mode: "planet",
    zoom: 1,
    yaw: 0,
    pitch: 0,
    roll: 0,
  },
  edge: {
    seam: 0.025,
    feather: 0,
    background: "#e9eff4",
    transparent: false,
  },
  revision: 1,
});

export const defaultFrame = (compositionId: string): PrintFrame => ({
  id: "frame-1",
  name: "图框 01",
  compositionId,
  shape: "circle",
  xMm: 60,
  yMm: 68,
  widthMm: 90,
  heightMm: 90,
  cornerRadiusMm: 0,
  crop: { zoom: 1, centerX: 0, centerY: 0 },
});

export const defaultPrintLayout = (): PrintLayout => {
  const composition = defaultComposition();
  return {
    paper: { ...paperPresets[0] },
    pageMode: "single",
    bleedMm: 3,
    safeMm: 8,
    dpi: 300,
    paperColor: "#ffffff",
    marks: {
      enabled: true,
      lengthMm: 4,
      offsetMm: 3,
      strokeMm: 0.25,
    },
    showSafeGuides: true,
    compositions: [composition],
    frames: [defaultFrame(composition.id)],
    activeFrameId: "frame-1",
    activeCompositionId: composition.id,
    initialized: false,
  };
};
