<script setup lang="ts">
import { computed } from "vue";
import {
  FileDown,
  AlertTriangle,
  Gauge,
  Scissors,
  Printer,
  X,
} from "lucide-vue-next";
import type { StudioDocument } from "../../../shared/types";
import type { PrintStudio } from "../model/usePrint";

const props = defineProps<{ studio: PrintStudio; doc: StudioDocument }>();
const settings = props.studio.settings;
const estimate = computed(() => props.studio.estimate.value);
const overflowCount = computed(() => props.studio.overflowFrames.value.length);

const capWarning = computed(
  () =>
    estimate.value.capped ||
    (estimate.value.sourceDpi > 0 &&
      estimate.value.sourceDpi < settings.dpi * 0.9) ||
    (settings.dpi > 300 && estimate.value.maxSide >= 4096),
);

function numeric(event: Event) {
  return Number((event.target as HTMLInputElement).value);
}
</script>

<template>
  <section class="panel print-panel print-export" id="print-export">
    <div class="section-label">
      <span>09 / 输出 PDF</span><FileDown :size="16" />
    </div>

    <label class="field-label" for="print-dpi">打印分辨率</label>
    <div class="print-dpi-row">
      <input
        id="print-dpi"
        type="number"
        min="72"
        max="1200"
        step="1"
        :value="settings.dpi"
        aria-label="打印分辨率 dpi"
        @change="studio.setDpi(numeric($event))"
      />
      <span>dpi</span>
    </div>
    <p class="mini export-dpi-note">
      分辨率按成品毫米换算为图框像素；页面尺寸不受 dpi 影响。
    </p>

    <div class="print-inline-row">
      <span>出血</span>
      <div class="segmented small print-bleed-switch">
        <button
          :class="{ active: settings.bleedMode === 'both' }"
          @click="settings.bleedMode = 'both'"
        >
          双页</button
        ><button
          :class="{ active: settings.bleedMode === 'bleed' }"
          @click="settings.bleedMode = 'bleed'"
        >
          含出血</button
        ><button
          :class="{ active: settings.bleedMode === 'trim' }"
          @click="settings.bleedMode = 'trim'"
        >
          成品
        </button>
      </div>
    </div>

    <label class="check print-check-line"
      ><input type="checkbox" v-model="settings.includeSafeGuide" />在输出中印出安全区参考线</label
    >

    <dl class="print-spec">
      <div>
        <dt><Printer :size="12" />成品</dt>
        <dd>{{ estimate.trim }}</dd>
      </div>
      <div>
        <dt><Scissors :size="12" />出血页</dt>
        <dd>{{ estimate.bleed }}</dd>
      </div>
      <div>
        <dt><Scissors :size="12" />含标记</dt>
        <dd>{{ estimate.media }}</dd>
      </div>
      <div>
        <dt><Gauge :size="12" />像素</dt>
        <dd>
          构图 {{ estimate.compositions }} 次 · 最大 {{ estimate.maxSide }} px
        </dd>
      </div>
      <div>
        <dt>有效源分辨率</dt>
        <dd>{{ estimate.sourceDpi }} dpi</dd>
      </div>
    </dl>

    <p v-if="overflowCount" class="mini warn">
      <AlertTriangle :size="12" />{{ overflowCount }} 个图框超出安全区，导出保持与预览相同的边界。
    </p>
    <p v-if="capWarning" class="mini warn">
      <AlertTriangle :size="12" />分辨率已受单构图上限 4096 px
      保护，裁切线与文字仍为矢量。
    </p>

    <button
      class="primary print-export-button"
      :disabled="!doc.asset || studio.busy.value"
      @click="studio.download()"
    >
      <FileDown :size="16" />
      {{
        studio.busy.value
          ? `正在生成 ${Math.round(studio.progress.value * 100)}%`
          : "导出印刷 PDF"
      }}
    </button>
    <button
      v-if="studio.busy.value"
      class="text-button"
      @click="studio.cancelExport()"
    >
      <X :size="13" /> 取消导出
    </button>
    <p v-if="studio.busy.value && studio.progressLabel.value" class="mini">
      {{ studio.progressLabel.value }}
    </p>
    <p v-if="studio.message.value" role="status" class="mini">
      {{ studio.message.value }}
    </p>
    <p class="export-foot">
      作品按物理尺寸栅格化，裁切线、折标与文字保持矢量；修改版面不应改变成品边界。
    </p>
  </section>
</template>
