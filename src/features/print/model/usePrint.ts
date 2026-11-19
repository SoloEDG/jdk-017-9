import { computed, reactive, ref, watch } from "vue";
import type {
  Edge,
  PrintComposition,
  PrintFrame,
  Projection,
  StudioDocument,
} from "../../../shared/types";
import {
  clampFrame,
  framesUsingComposition,
  pageGeometry,
  safeOverflowSides,
  sheetHeightMm,
  sheetWidthMm,
  sourceEffectiveDpi,
  type PreviewVariant,
} from "../../../shared/print/geometry";
import { clamp } from "../../../shared/math";
import {
  activeComposition,
  activeFrame,
  addFrame,
  duplicateFrame,
  newComposition,
  removeFrame,
} from "../model/actions";
import { planCompositions } from "../lib/plan";
import { exportPrintPdf, type ExportSummary } from "../lib/exportPdf";
import { onPreviewBusy, onPreviewReady } from "../lib/preview";

export interface PrintExportSettings {
  dpi: number;
  bleedMode: "bleed" | "trim" | "both";
  includeSafeGuide: boolean;
}

export function usePrintStudio(doc: StudioDocument) {
  const layout = doc.print;
  const previewVariant = ref<PreviewVariant>("bleed");
  const userZoom = ref(1);
  const tool = ref<"frame" | "crop">("frame");
  const selectedId = ref<string | null>(layout.activeFrameId ?? null);
  const hoverId = ref<string | null>(null);
  const showOutlines = ref(true);
  const viewportWidth = ref(620);
  const editingCompositionId = ref<string | null>(null);
  const confirmEditId = ref<string | null>(null);
  const previewRevision = ref(0);
  const busy = ref(false);
  const progress = ref(0);
  const progressLabel = ref("");
  const message = ref("");
  const settings = reactive<PrintExportSettings>({
    dpi: layout.dpi,
    bleedMode: "both",
    includeSafeGuide: false,
  });
  let controller: AbortController | null = null;

  const offReady = onPreviewReady(() => {
    previewRevision.value += 1;
  });
  const busyRenders = ref(0);
  const offBusy = onPreviewBusy((count) => {
    busyRenders.value = count;
  });

  function ensureInitialized(
    projection: Projection = doc.projection,
    edge: Edge = doc.edge,
  ) {
    if (layout.initialized) return;
    const composition = layout.compositions[0];
    const frame = layout.frames[0];
    composition.projection = { ...projection };
    composition.edge = { ...edge };
    const side = Math.max(
      20,
      Math.min(
        110,
        sheetWidthMm(layout) - 2 * (layout.safeMm + 10),
        sheetHeightMm(layout) - 2 * (layout.safeMm + 10),
      ),
    );
    frame.widthMm = side;
    frame.heightMm = side;
    frame.xMm = (sheetWidthMm(layout) - side) / 2;
    frame.yMm = (sheetHeightMm(layout) - side) / 2;
    layout.activeFrameId = frame.id;
    layout.activeCompositionId = composition.id;
    layout.initialized = true;
    selectedId.value = frame.id;
  }

  const active = computed(() => activeFrame(layout));
  const activeComp = computed(() => activeComposition(layout));
  const geometry = computed(() => pageGeometry(layout, previewVariant.value));
  const ppmm = computed(() => {
    const fit = (viewportWidth.value - 8) / Math.max(1, geometry.value.media.width);
    return clamp(fit * userZoom.value, 0.05, 24);
  });
  const canvasWidth = computed(() => geometry.value.media.width * ppmm.value);
  const canvasHeight = computed(() => geometry.value.media.height * ppmm.value);
  const editing = computed(() =>
    editingCompositionId.value
      ? (layout.compositions.find(
          (c) => c.id === editingCompositionId.value,
        ) ?? null)
      : null,
  );
  const confirmFrames = computed(() =>
    confirmEditId.value
      ? framesUsingComposition(layout, confirmEditId.value)
      : [],
  );
  const affectedIds = computed(() => {
    const id = editingCompositionId.value ?? confirmEditId.value;
    return id
      ? framesUsingComposition(layout, id).map((frame) => frame.id)
      : [];
  });
  const overflowFrames = computed(() =>
    layout.frames.filter(
      (frame) => safeOverflowSides(layout, frame).length > 0,
    ),
  );
  const renderPlan = computed(() => ({
    compositions: planCompositions(layout, layout.frames, settings.dpi),
  }));
  const sourceDpi = computed(() =>
    doc.asset && active.value
      ? Math.round(sourceEffectiveDpi(doc.asset, active.value))
      : 0,
  );
  const usageCount = (compositionId: string) =>
    layout.frames.filter((frame) => frame.compositionId === compositionId)
      .length;
  const activeUsage = computed(() =>
    activeComp.value ? usageCount(activeComp.value.id) : 0,
  );

  function select(frameId: string | null) {
    selectedId.value = frameId;
    layout.activeFrameId = frameId;
    const frame = layout.frames.find((f) => f.id === frameId);
    if (frame) layout.activeCompositionId = frame.compositionId;
  }

  function createFrame() {
    const frame = addFrame(layout, layout.activeCompositionId ?? undefined);
    select(frame.id);
  }
  function copyFrame() {
    if (!active.value) return;
    const frame = duplicateFrame(layout, active.value.id);
    if (frame) select(frame.id);
  }
  function deleteFrame() {
    if (!active.value) return;
    const current = active.value;
    const index = layout.frames.findIndex((f) => f.id === current.id);
    removeFrame(layout, current.id);
    select(layout.frames[index]?.id ?? layout.frames[index - 1]?.id ?? null);
  }
  function updateFrame(patch: Partial<PrintFrame>) {
    if (!active.value) return;
    const frame = active.value;
    if (patch.shape && patch.shape !== frame.shape) {
      if (patch.shape === "circle") {
        const side = Math.min(frame.widthMm, frame.heightMm);
        frame.widthMm = side;
        frame.heightMm = side;
        frame.cornerRadiusMm = 0;
      }
      frame.shape = patch.shape;
    }
    if (typeof patch.xMm === "number") frame.xMm = patch.xMm;
    if (typeof patch.yMm === "number") frame.yMm = patch.yMm;
    if (typeof patch.widthMm === "number") {
      frame.widthMm = Math.max(5, patch.widthMm);
      if (frame.shape === "circle") frame.heightMm = frame.widthMm;
    }
    if (typeof patch.heightMm === "number") {
      frame.heightMm = Math.max(5, patch.heightMm);
      if (frame.shape === "circle") frame.widthMm = frame.heightMm;
    }
    if (typeof patch.cornerRadiusMm === "number")
      frame.cornerRadiusMm = patch.cornerRadiusMm;
    if (patch.name) frame.name = patch.name;
    clampFrame(frame, layout);
  }

  /* Composition editing is gated: frames that share a reference are shown
     before any change is applied. */
  function requestCompositionEdit() {
    const comp = activeComp.value;
    if (!comp) return;
    const frames = framesUsingComposition(layout, comp.id);
    if (frames.length > 1) {
      confirmEditId.value = comp.id;
      editingCompositionId.value = null;
    } else {
      editingCompositionId.value = comp.id;
    }
  }
  function confirmCompositionEdit() {
    if (!confirmEditId.value) return;
    editingCompositionId.value = confirmEditId.value;
    confirmEditId.value = null;
  }
  function cancelCompositionEdit() {
    confirmEditId.value = null;
    editingCompositionId.value = null;
  }

  function updateCompositionProjection(
    key: keyof Projection,
    value: number | string,
  ) {
    const comp = editing.value;
    if (!comp) return;
    const p = comp.projection;
    if (key === "mode") p.mode = value === "tunnel" ? "tunnel" : "planet";
    else {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      if (key === "zoom") p.zoom = clamp(n, 0.3, 3);
      else if (key === "pitch") p.pitch = clamp(n, -85, 85);
      else p[key] = ((n % 360) + 360) % 360;
    }
    comp.revision += 1;
  }
  function updateCompositionEdge(
    key: keyof Edge,
    value: number | string | boolean,
  ) {
    const comp = editing.value;
    if (!comp) return;
    const e = comp.edge;
    if (key === "seam") e.seam = clamp(Number(value), 0, 0.15);
    else if (key === "feather") e.feather = clamp(Number(value), 0, 0.4);
    else if (
      key === "background" &&
      typeof value === "string" &&
      /^#[0-9a-f]{6}$/i.test(value)
    )
      e.background = value;
    else if (key === "transparent") e.transparent = Boolean(value);
    comp.revision += 1;
  }
  function syncCompositionFromLive() {
    const comp = editing.value;
    if (!comp) return;
    comp.projection = { ...doc.projection };
    comp.edge = { ...doc.edge };
    comp.revision += 1;
  }

  function createComposition(assign: boolean) {
    const composition = newComposition(layout);
    layout.compositions.push(composition);
    layout.activeCompositionId = composition.id;
    if (assign && active.value) active.value.compositionId = composition.id;
    editingCompositionId.value = null;
    return composition;
  }
  function deleteComposition() {
    const comp = activeComp.value;
    if (!comp || layout.compositions.length <= 1) return;
    if (usageCount(comp.id) > 0) {
      message.value = "该构图仍被图框引用，请先在「图框」中改指其他构图";
      return;
    }
    layout.compositions = layout.compositions.filter((c) => c.id !== comp.id);
    layout.activeCompositionId = layout.compositions[0].id;
    editingCompositionId.value = null;
  }
  function focusComposition(compositionId: string) {
    if (!layout.compositions.some((c) => c.id === compositionId)) return;
    layout.activeCompositionId = compositionId;
    editingCompositionId.value = null;
    confirmEditId.value = null;
  }
  function assignActiveFrame(compositionId: string) {
    if (!active.value) return;
    active.value.compositionId = compositionId;
    layout.activeCompositionId = compositionId;
    editingCompositionId.value = null;
  }

  function setPaper(widthMm: number, heightMm: number, name?: string) {
    layout.paper = {
      id: name ? "custom" : layout.paper.id,
      name: name ?? "自定义",
      widthMm: clamp(Math.round(widthMm * 10) / 10, 20, 1200),
      heightMm: clamp(Math.round(heightMm * 10) / 10, 20, 1200),
    };
    clampAllFrames();
  }
  function setPageMode(mode: "single" | "spread") {
    layout.pageMode = mode;
    clampAllFrames();
  }
  function setBleed(value: number) {
    layout.bleedMm = clamp(value, 0, 20);
    clampAllFrames();
  }
  function setSafe(value: number) {
    layout.safeMm = clamp(
      value,
      0,
      Math.min(sheetWidthMm(layout), sheetHeightMm(layout)) / 2 - 1,
    );
  }
  function setDpi(value: number) {
    settings.dpi = clamp(Math.round(value), 72, 1200);
    layout.dpi = settings.dpi;
  }
  function clampAllFrames() {
    for (const frame of layout.frames) clampFrame(frame, layout);
  }

  watch(
    () => [sheetWidthMm(layout), sheetHeightMm(layout)],
    clampAllFrames,
  );

  function download() {
    if (busy.value || !doc.asset) return;
    busy.value = true;
    progress.value = 0;
    progressLabel.value = "";
    message.value = "";
    controller = new AbortController();
    exportPrintPdf({
      layout,
      asset: doc.asset,
      dpi: settings.dpi,
      bleedMode: settings.bleedMode,
      includeSafeGuide: settings.includeSafeGuide,
      signal: controller.signal,
      onProgress: (fraction, label) => {
        progress.value = fraction;
        if (label) progressLabel.value = label;
      },
    })
      .then((result) => {
        if (controller?.signal.aborted) return;
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `orbit-print-${layout.pageMode}-${settings.dpi}dpi-${settings.bleedMode}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        message.value = summarize(result.summaries);
      })
      .catch((error: unknown) => {
        message.value = controller?.signal.aborted
          ? "已取消导出"
          : error instanceof Error
            ? error.message
            : "导出失败";
      })
      .finally(() => {
        busy.value = false;
        controller = null;
      });
  }
  function cancelExport() {
    controller?.abort();
  }

  const estimate = computed(() => ({
    trim: `${geometry.value.sheet.width} × ${geometry.value.sheet.height} mm`,
    bleed: `${geometry.value.bleed.width} × ${geometry.value.bleed.height} mm`,
    media: `${geometry.value.media.width} × ${geometry.value.media.height} mm`,
    frames: layout.frames.length,
    compositions: renderPlan.value.compositions.length,
    capped: renderPlan.value.compositions.some(
      (c) => c.requestedSide > c.side + 0.5,
    ),
    maxSide: Math.max(
      0,
      ...renderPlan.value.compositions.map((c) => c.side),
    ),
    sourceDpi: sourceDpi.value,
  }));

  return {
    layout,
    previewVariant,
    userZoom,
    tool,
    selectedId,
    hoverId,
    showOutlines,
    viewportWidth,
    previewRevision,
    geometry,
    ppmm,
    canvasWidth,
    canvasHeight,
    active,
    activeComp,
    editing,
    confirmEditId,
    confirmFrames,
    affectedIds,
    overflowFrames,
    renderPlan,
    sourceDpi,
    activeUsage,
    settings,
    busy,
    progress,
    progressLabel,
    message,
    estimate,
    busyRenders,
    ensureInitialized,
    usageCount,
    select,
    createFrame,
    copyFrame,
    deleteFrame,
    updateFrame,
    requestCompositionEdit,
    confirmCompositionEdit,
    cancelCompositionEdit,
    updateCompositionProjection,
    updateCompositionEdge,
    syncCompositionFromLive,
    createComposition,
    deleteComposition,
    focusComposition,
    assignActiveFrame,
    setPaper,
    setPageMode,
    setBleed,
    setSafe,
    setDpi,
    download,
    cancelExport,
    stopPreview: () => {
      offReady();
      offBusy();
    },
  };
}

export type PrintStudio = ReturnType<typeof usePrintStudio>;

function summarize(summaries: ExportSummary[]) {
  return summaries
    .map(
      (s) =>
        `${s.variant === "bleed" ? "带出血" : "成品尺寸"} ${s.trimWidthMm}×${s.trimHeightMm} mm · ${s.dpi} dpi · 构图渲染 ${s.compositionRenders} 次 · 图框 ${s.frameRenders} 个`,
    )
    .join("；");
}

export type { PrintComposition };
