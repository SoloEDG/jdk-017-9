<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  MousePointer2,
  Crop,
  Grid2x2,
  Scissors,
  Layers,
  Move,
} from "lucide-vue-next";
import type { StudioDocument } from "../../../shared/types";
import { usePrintStudio } from "../model/usePrint";
import { compositionForFrame } from "../model/actions";
import { paintPage } from "../lib/preview";
import { panCrop, zoomCrop } from "../../../shared/print/crop";
import { pageGeometry } from "../../../shared/print/geometry";
import PrintSettingsPanel from "./PrintSettingsPanel.vue";
import FramePanel from "./FramePanel.vue";
import CompositionPanel from "./CompositionPanel.vue";
import PrintExportPanel from "./PrintExportPanel.vue";

const props = defineProps<{ doc: StudioDocument }>();
const studio = usePrintStudio(props.doc);
const canvas = ref<HTMLCanvasElement>();
const stage = ref<HTMLDivElement>();

const drag = ref<{
  mode: "move" | "resize" | "crop";
  handle: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  frameId: string;
} | null>(null);

const selected = computed(() => studio.active.value);
const editingMode = computed(() => studio.tool.value === "crop");

function setSelection(id: string | null) {
  studio.select(id);
}

function localMm(event: PointerEvent | WheelEvent) {
  const el = canvas.value!;
  const rect = el.getBoundingClientRect();
  const g = studio.geometry.value;
  return {
    x: g.media.x + (event.clientX - rect.left) / studio.ppmm.value,
    y: g.media.y + (event.clientY - rect.top) / studio.ppmm.value,
  };
}

function hitTest(x: number, y: number) {
  const frames = [...studio.layout.frames].reverse();
  for (const frame of frames) {
    if (frame.shape === "circle") {
      const cx = frame.xMm + frame.widthMm / 2;
      const cy = frame.yMm + frame.heightMm / 2;
      const nx = (x - cx) / (frame.widthMm / 2);
      const ny = (y - cy) / (frame.heightMm / 2);
      if (nx * nx + ny * ny <= 1) return frame;
    } else if (
      x >= frame.xMm &&
      x <= frame.xMm + frame.widthMm &&
      y >= frame.yMm &&
      y <= frame.yMm + frame.heightMm
    ) {
      return frame;
    }
  }
  return null;
}

function handleAt(x: number, y: number, frameId: string) {
  const frame = studio.layout.frames.find((f) => f.id === frameId);
  if (!frame) return null;
  const tolerance = 6 / studio.ppmm.value;
  const corners: [string, number, number][] = [
    ["nw", frame.xMm, frame.yMm],
    ["ne", frame.xMm + frame.widthMm, frame.yMm],
    ["sw", frame.xMm, frame.yMm + frame.heightMm],
    ["se", frame.xMm + frame.widthMm, frame.yMm + frame.heightMm],
  ];
  for (const [name, hx, hy] of corners)
    if (Math.abs(x - hx) <= tolerance && Math.abs(y - hy) <= tolerance)
      return name;
  return null;
}

function down(event: PointerEvent) {
  if (event.button !== 0) return;
  const point = localMm(event);
  const current = studio.active.value;
  const handle = current ? handleAt(point.x, point.y, current.id) : null;
  if (handle && current) {
    studio.tool.value = "frame";
    drag.value = {
      mode: "resize",
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: current.xMm,
      startY: current.yMm,
      startW: current.widthMm,
      startH: current.heightMm,
      frameId: current.id,
    };
  } else {
    const frame = hitTest(point.x, point.y);
    if (!frame) {
      setSelection(null);
      return;
    }
    setSelection(frame.id);
    drag.value = {
      mode: editingMode.value ? "crop" : "move",
      handle: "",
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: frame.xMm,
      startY: frame.yMm,
      startW: frame.widthMm,
      startH: frame.heightMm,
      frameId: frame.id,
    };
  }
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function move(event: PointerEvent) {
  const state = drag.value;
  if (!state) {
    const point = localMm(event);
    const hovered = hitTest(point.x, point.y);
    studio.hoverId.value = hovered?.id ?? null;
    return;
  }
  const dx = (event.clientX - state.startClientX) / studio.ppmm.value;
  const dy = (event.clientY - state.startClientY) / studio.ppmm.value;
  const frame = studio.layout.frames.find((f) => f.id === state.frameId);
  if (!frame) return;
  if (state.mode === "crop") {
    panCrop(frame, dx, dy);
    return;
  }
  if (state.mode === "move") {
    frame.xMm = state.startX + dx;
    frame.yMm = state.startY + dy;
    studio.updateFrame({});
    return;
  }
  const min = 8;
  let x = state.startX;
  let y = state.startY;
  let w = state.startW;
  let h = state.startH;
  if (state.handle.includes("e")) w = Math.max(min, state.startW + dx);
  if (state.handle.includes("s")) h = Math.max(min, state.startH + dy);
  if (state.handle.includes("w")) {
    w = Math.max(min, state.startW - dx);
    x = state.startX + state.startW - w;
  }
  if (state.handle.includes("n")) {
    h = Math.max(min, state.startH - dy);
    y = state.startY + state.startH - h;
  }
  if (frame.shape === "circle") {
    // Circles stay square while dragging any corner.
    const side = Math.max(min, w, h);
    if (state.handle.includes("w")) x = state.startX + state.startW - side;
    if (state.handle.includes("n")) y = state.startY + state.startH - side;
    w = side;
    h = side;
  }
  studio.updateFrame({ xMm: x, yMm: y, widthMm: w, heightMm: h });
}

function up() {
  drag.value = null;
}

function wheel(event: WheelEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const frame = studio.active.value;
  if (editingMode.value && frame) {
    event.preventDefault();
    zoomCrop(frame, frame.crop.zoom * Math.exp(-event.deltaY * 0.0015));
    return;
  }
  event.preventDefault();
  const factor = Math.exp(-event.deltaY * 0.0015);
  studio.userZoom.value = Math.min(
    8,
    Math.max(0.25, studio.userZoom.value * factor),
  );
}

function resetFit() {
  studio.userZoom.value = 1;
}

function nudge(event: KeyboardEvent) {
  const frame = studio.active.value;
  if (!frame) return;
  const step = event.shiftKey ? 5 : 0.5;
  const map: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  const delta = map[event.key];
  if (!delta) return;
  event.preventDefault();
  studio.updateFrame({
    xMm: frame.xMm + delta[0],
    yMm: frame.yMm + delta[1],
  });
}

const frameSignature = computed(() =>
  studio.layout.frames
    .map(
      (frame) =>
        `${frame.id}:${frame.shape}:${frame.xMm}:${frame.yMm}:${frame.widthMm}:${frame.heightMm}:${frame.cornerRadiusMm}:${frame.compositionId}:${frame.crop.zoom}:${frame.crop.centerX}:${frame.crop.centerY}`,
    )
    .join("|"),
);

const hoverLabel = computed(() => {
  const hovered = studio.layout.frames.find(
    (frame) => frame.id === studio.hoverId.value,
  );
  return hovered ? hovered.name : "";
});

watchEffect(() => {
  const el = canvas.value;
  if (!el) return;
  // Depend on every value that changes pixels or guides.
  void studio.previewRevision.value;
  void studio.ppmm.value;
  void studio.geometry.value;
  void frameSignature.value;
  void studio.layout.paperColor;
  void studio.layout.marks.enabled;
  void studio.layout.showSafeGuides;
  void studio.layout.pageMode;
  void studio.selectedId.value;
  void studio.hoverId.value;
  void studio.affectedIds.value.length;
  void studio.showOutlines.value;
  void studio.previewVariant.value;
  paintPage(el, {
    layout: studio.layout,
    asset: props.doc.asset,
    frames: studio.layout.frames,
    geometry: studio.geometry.value,
    variant: studio.previewVariant.value,
    ppmm: studio.ppmm.value,
    dpr: window.devicePixelRatio || 1,
    widthCss: studio.canvasWidth.value,
    heightCss: studio.canvasHeight.value,
    selectedId: studio.selectedId.value,
    hoverId: studio.hoverId.value,
    affectedIds: studio.affectedIds.value,
    showOutlines: studio.showOutlines.value,
    showSafeGuides: studio.layout.showSafeGuides,
    resolveComposition: (frame) => compositionForFrame(studio.layout, frame),
  });
});

let observer: ResizeObserver | null = null;
onMounted(() => {
  studio.ensureInitialized();
  if (stage.value && canvas.value) {
    observer = new ResizeObserver(() => {
      const width = stage.value!.clientWidth;
      if (width > 0) studio.viewportWidth.value = width;
    });
    observer.observe(stage.value);
    if (stage.value.clientWidth > 0)
      studio.viewportWidth.value = stage.value.clientWidth;
  }
});
onBeforeUnmount(() => {
  observer?.disconnect();
  studio.stopPreview();
});

const running = computed(() => studio.busyRenders.value > 0);
</script>

<template>
  <div class="print-workspace">
    <aside class="print-side print-side-left">
      <PrintSettingsPanel :studio="studio" />
      <FramePanel :studio="studio" />
    </aside>
    <div class="print-canvas-column">
      <div class="print-canvas-head">
        <div>
          <span class="eyebrow">PRINT SHEET</span>
          <h1>印刷版面</h1>
        </div>
        <div class="print-head-right">
          <span class="live" :class="{ pending: running }"
            ><i />{{ running ? "正在生成预览" : "版面就绪" }}</span
          >
          <div class="segmented small print-variant-switch">
            <button
              :class="{ active: studio.previewVariant.value === 'bleed' }"
              @click="studio.previewVariant.value = 'bleed'"
            >
              含出血
            </button>
            <button
              :class="{ active: studio.previewVariant.value === 'trim' }"
              @click="studio.previewVariant.value = 'trim'"
            >
              成品尺寸
            </button>
          </div>
        </div>
      </div>

      <div ref="stage" class="print-stage">
        <div class="print-stage-caption">
          <span>
            {{ studio.layout.pageMode === "spread" ? "跨页" : "单页" }} ·
            {{ studio.geometry.value.media.width.toFixed(1) }} ×
            {{ studio.geometry.value.media.height.toFixed(1) }} mm
          </span>
          <span>{{ Math.round(studio.ppmm.value * 25.4) }} px/in 屏幕放大</span>
        </div>
        <canvas
          ref="canvas"
          class="print-canvas"
          :class="{ cropping: editingMode }"
          tabindex="0"
          aria-label="印刷版面预览"
          @pointerdown="down"
          @pointermove="move"
          @pointerup="up"
          @pointercancel="up"
          @pointerleave="studio.hoverId.value = null"
          @wheel="wheel"
          @keydown="nudge"
        />
        <div v-if="!props.doc.asset" class="print-empty">
          先导入一张全景照片，再开始排版
        </div>
      </div>

      <div class="print-toolbar">
        <div class="gesture-hint">
          <MousePointer2 :size="14" /> 拖动图框
          <span>·</span><Crop :size="14" /> 拖动手柄调整尺寸
          <span>·</span><Move :size="14" /> 滚轮缩放版面
        </div>
        <div class="tool-buttons">
          <button
            aria-label="选择图框"
            :class="{ selected: studio.tool.value === 'frame' }"
            @click="studio.tool.value = 'frame'"
          >
            <MousePointer2 :size="16" />
          </button>
          <button
            aria-label="取景裁切"
            :class="{ selected: studio.tool.value === 'crop' }"
            @click="studio.tool.value = 'crop'"
          >
            <Crop :size="16" />
          </button>
          <b />
          <button aria-label="缩小版面" @click="studio.userZoom.value = Math.max(0.25, studio.userZoom.value / 1.25)">
            <ZoomOut :size="16" />
          </button>
          <span>{{ Math.round(studio.userZoom.value * 100) }}%</span>
          <button aria-label="放大版面" @click="studio.userZoom.value = Math.min(8, studio.userZoom.value * 1.25)">
            <ZoomIn :size="16" />
          </button>
          <button aria-label="适应窗口" @click="resetFit">
            <Maximize2 :size="16" />
          </button>
          <b />
          <button
            aria-label="显示图框轮廓"
            :class="{ selected: studio.showOutlines.value }"
            @click="studio.showOutlines.value = !studio.showOutlines.value"
          >
            <Layers :size="16" />
          </button>
        </div>
      </div>

      <div class="print-notes">
        <span v-if="hoverLabel">悬停：{{ hoverLabel }}</span>
        <span v-else-if="studio.overflowFrames.value.length">
          <span class="warn-dot" />{{ studio.overflowFrames.value.length }}
          个图框超出安全区
        </span>
        <span v-else>所有图框均在安全区内</span>
        <span class="print-facts">
          <Grid2x2 :size="13" />{{ studio.layout.frames.length }} 图框 ·
          {{ studio.layout.compositions.length }} 构图
          <Scissors :size="13" />{{ studio.layout.bleedMm }} mm 出血 ·
          {{ studio.layout.safeMm }} mm 安全区
        </span>
      </div>
    </div>

    <aside class="print-side print-side-right">
      <CompositionPanel :studio="studio" :doc="props.doc" />
      <PrintExportPanel :studio="studio" :doc="props.doc" />
    </aside>
  </div>
</template>