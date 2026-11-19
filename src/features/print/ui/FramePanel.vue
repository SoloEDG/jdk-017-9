<script setup lang="ts">
import { computed } from "vue";
import {
  Frame,
  Circle,
  Square,
  Copy,
  Trash2,
  Plus,
  Crop,
  RotateCcw,
  Crosshair,
  AlertTriangle,
} from "lucide-vue-next";
import type { PrintStudio } from "../model/usePrint";
import {
  frameCropWindow,
  resetCrop,
  zoomCrop,
} from "../../../shared/print/crop";
import {
  safeOverflowSides,
  structureReports,
  frameLabelSafe,
} from "../../../shared/print/geometry";

const props = defineProps<{ studio: PrintStudio }>();
const layout = props.studio.layout;
const active = computed(() => props.studio.active.value);
const overflow = computed(() => {
  const frame = active.value;
  if (!frame) return [];
  return safeOverflowSides(layout, frame);
});
const cropInfo = computed(() => {
  const frame = active.value;
  if (!frame) return null;
  const crop = frameCropWindow(frame);
  return {
    zoom: frame.crop.zoom,
    percent: Math.round((crop.width * crop.height) * 100),
  };
});
const usage = computed(() => {
  const frame = active.value;
  if (!frame) return 0;
  return props.studio.usageCount(frame.compositionId);
});

function numeric(event: Event) {
  return Number((event.target as HTMLInputElement).value);
}

function rename(event: Event) {
  const value = (event.target as HTMLInputElement).value.trim();
  if (value) props.studio.updateFrame({ name: value });
}

const reports = computed(() =>
  // The active frame's safe-zone status is shown above; list other issues only.
  structureReports(layout).filter(
    (report) => report.id !== `safe-${active.value?.id}`,
  ),
);
</script>

<template>
  <section class="panel print-panel">
    <div class="section-label">
      <span>07 / 图框</span><Frame :size="16" />
    </div>

    <div class="print-frame-actions">
      <button class="text-button" @click="studio.createFrame()">
        <Plus :size="14" /> 新建图框
      </button>
      <button
        class="text-button"
        :disabled="!active"
        @click="studio.copyFrame()"
      >
        <Copy :size="13" /> 复制引用
      </button>
      <button
        class="text-button danger"
        :disabled="!active || layout.frames.length <= 1"
        @click="studio.deleteFrame()"
      >
        <Trash2 :size="13" /> 删除
      </button>
    </div>

    <ul class="frame-list" role="listbox" aria-label="图框列表">
      <li
        v-for="frame in layout.frames"
        :key="frame.id"
        role="option"
        :aria-selected="frame.id === studio.selectedId.value"
        :class="{
          active: frame.id === studio.selectedId.value,
          flagged: safeOverflowSides(layout, frame).length > 0,
        }"
        @click="studio.select(frame.id)"
        @mouseenter="studio.hoverId.value = frame.id"
        @mouseleave="studio.hoverId.value = null"
      >
        <span class="frame-shape">
          <Circle v-if="frame.shape === 'circle'" :size="13" /><Square
            v-else
            :size="13"
          />
        </span>
        <span class="frame-meta">
          <strong>{{ frame.name }}</strong>
          <span>{{ frameLabelSafe(layout, frame) }}</span>
        </span>
        <span v-if="studio.usageCount(frame.compositionId) > 1" class="frame-badge"
          >共享 ×{{ studio.usageCount(frame.compositionId) }}</span
        >
      </li>
    </ul>

    <template v-if="active">
      <label class="field-label">图框名称</label>
      <input
        class="print-text-input"
        :value="active.name"
        aria-label="图框名称"
        @change="rename"
      />

      <div class="print-inline-row">
        <span>形状</span>
        <div class="segmented small">
          <button
            :class="{ active: active.shape === 'circle' }"
            @click="studio.updateFrame({ shape: 'circle' })"
          >
            圆形</button
          ><button
            :class="{ active: active.shape === 'rect' }"
            @click="studio.updateFrame({ shape: 'rect' })"
          >
            矩形
          </button>
        </div>
      </div>

      <div class="print-mm-row">
        <label
          >X mm<input
            :value="active.xMm"
            type="number"
            step="0.5"
            aria-label="图框 X 位置"
            @change="
              studio.updateFrame({ xMm: numeric($event) })
            " /></label
        ><label
          >Y mm<input
            :value="active.yMm"
            type="number"
            step="0.5"
            aria-label="图框 Y 位置"
            @change="studio.updateFrame({ yMm: numeric($event) })" /></label
        ><label
          >宽 mm<input
            :value="active.widthMm"
            type="number"
            min="5"
            step="0.5"
            aria-label="图框宽度"
            @change="studio.updateFrame({ widthMm: numeric($event) })" /></label
        ><label
          >高 mm<input
            :value="active.heightMm"
            type="number"
            min="5"
            step="0.5"
            aria-label="图框高度"
            :disabled="active.shape === 'circle'"
            @change="studio.updateFrame({ heightMm: numeric($event) })"
        /></label>
      </div>

      <label v-if="active.shape === 'rect'" class="control"
        >圆角 <output>{{ active.cornerRadiusMm.toFixed(1) }} mm</output
        ><input
          aria-label="圆角毫米"
          type="range"
          min="0"
          :max="Math.min(active.widthMm, active.heightMm) / 2"
          step="0.5"
          :value="active.cornerRadiusMm"
          @input="
            studio.updateFrame({ cornerRadiusMm: numeric($event) })
          "
      /></label>

      <div class="print-divider" />
      <div class="print-label-line">
        <span><Crop :size="13" />取景（仅影响本图框）</span>
        <span class="hint">{{ cropInfo?.percent }}% 画面</span>
      </div>
      <label class="control"
        >取景缩放 <output>{{ (cropInfo?.zoom ?? 1).toFixed(2) }}×</output
        ><input
          aria-label="取景缩放"
          type="range"
          min="1"
          max="8"
          step="0.05"
          :value="cropInfo?.zoom ?? 1"
          @input="active && zoomCrop(active, numeric($event))"
      /></label>
      <button class="text-button" @click="active && resetCrop(active)">
        <RotateCcw :size="13" /> 居中原始取景
      </button>
      <p class="mini">
        同一构图可被多个图框引用，取景与位置各自保存。共 {{ usage }} 个图框引用此构图。
      </p>

      <p v-if="overflow.length" class="mini warn">
        <AlertTriangle :size="12" /> 超出安全区：{{ overflow.join("、") }}边
      </p>
      <p v-else class="mini ok">完全位于安全区内</p>

      <div v-if="reports.length" class="print-checks">
        <div v-for="report in reports" :key="report.id">
          <AlertTriangle :size="12" />{{ report.text }}
        </div>
      </div>

      <div v-if="layout.compositions.length > 1" class="print-inline-row">
        <span>引用构图</span>
        <select
          aria-label="图框引用构图"
          :value="active.compositionId"
          @change="
            studio.assignActiveFrame(
              ($event.target as HTMLSelectElement).value,
            )
          "
        >
          <option
            v-for="composition in layout.compositions"
            :key="composition.id"
            :value="composition.id"
          >
            {{ composition.name }}
          </option>
        </select>
      </div>
    </template>
    <p v-else class="mini"><Crosshair :size="12" /> 在版面上点选一个图框以编辑</p>
  </section>
</template>
