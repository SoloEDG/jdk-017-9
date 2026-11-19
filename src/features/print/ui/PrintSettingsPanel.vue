<script setup lang="ts">
import { computed, reactive } from "vue";
import { Ruler, Frame, Printer } from "lucide-vue-next";
import { paperPresets, dpiPresets } from "../../../shared/print/defaults";
import type { PrintStudio } from "../model/usePrint";

const props = defineProps<{ studio: PrintStudio }>();
const layout = props.studio.layout;
const custom = reactive({
  width: layout.paper.widthMm,
  height: layout.paper.heightMm,
});

const activePreset = computed(() => {
  return (
    paperPresets.find(
      (preset) =>
        preset.widthMm === layout.paper.widthMm &&
        preset.heightMm === layout.paper.heightMm,
    )?.id ?? "custom"
  );
});

function applyPreset(event: Event) {
  const id = (event.target as HTMLSelectElement).value;
  const preset = paperPresets.find((p) => p.id === id);
  if (!preset) return;
  props.studio.setPaper(preset.widthMm, preset.heightMm, preset.name);
  custom.width = preset.widthMm;
  custom.height = preset.heightMm;
}

function applyCustom() {
  props.studio.setPaper(custom.width, custom.height);
}

function swap() {
  const width = custom.width;
  custom.width = custom.height;
  custom.height = width;
  applyCustom();
}

const orientation = computed(() =>
  layout.paper.widthMm > layout.paper.heightMm ? "landscape" : "portrait",
);

function setOrientation(mode: "portrait" | "landscape") {
  const short = Math.min(layout.paper.widthMm, layout.paper.heightMm);
  const long = Math.max(layout.paper.widthMm, layout.paper.heightMm);
  custom.width = mode === "portrait" ? short : long;
  custom.height = mode === "portrait" ? long : short;
  applyCustom();
}
</script>

<template>
  <section class="panel print-panel">
    <div class="section-label">
      <span>06 / 印张设置</span><Ruler :size="16" />
    </div>

    <label class="field-label" for="paper-preset">纸张</label>
    <select
      id="paper-preset"
      :value="activePreset"
      @change="applyPreset"
    >
      <option v-for="preset in paperPresets" :key="preset.id" :value="preset.id">
        {{ preset.name }} · {{ preset.widthMm }} × {{ preset.heightMm }}
      </option>
      <option value="custom">自定义尺寸</option>
    </select>

    <div class="print-mm-row">
      <label
        >宽 mm<input
          aria-label="纸张宽度毫米"
          type="number"
          min="20"
          max="1200"
          step="1"
          v-model.number="custom.width"
          @change="applyCustom" /></label
      ><label
        >高 mm<input
          aria-label="纸张高度毫米"
          type="number"
          min="20"
          max="1200"
          step="1"
          v-model.number="custom.height"
          @change="applyCustom" /></label
      ><button class="swap-button" aria-label="交换纸张方向" @click="swap">
        ⇄
      </button>
    </div>

    <div class="print-inline-row">
      <span>方向</span>
      <div class="segmented small">
        <button
          :class="{ active: orientation === 'portrait' }"
          @click="setOrientation('portrait')"
        >
          纵向</button
        ><button
          :class="{ active: orientation === 'landscape' }"
          @click="setOrientation('landscape')"
        >
          横向
        </button>
      </div>
    </div>

    <div class="print-inline-row">
      <span>版面</span>
      <div class="segmented small">
        <button
          :class="{ active: layout.pageMode === 'single' }"
          @click="studio.setPageMode('single')"
        >
          单页</button
        ><button
          :class="{ active: layout.pageMode === 'spread' }"
          @click="studio.setPageMode('spread')"
        >
          跨页
        </button>
      </div>
    </div>

    <label class="control"
      >出血 <output>{{ layout.bleedMm.toFixed(1) }} mm</output
      ><input
        aria-label="出血毫米"
        type="range"
        min="0"
        max="10"
        step="0.5"
        :value="layout.bleedMm"
        @input="
          studio.setBleed(Number(($event.target as HTMLInputElement).value))
        "
    /></label>

    <label class="control"
      >安全区 <output>{{ layout.safeMm.toFixed(1) }} mm</output
      ><input
        aria-label="安全区毫米"
        type="range"
        min="0"
        max="30"
        step="0.5"
        :value="layout.safeMm"
        @input="
          studio.setSafe(Number(($event.target as HTMLInputElement).value))
        "
    /></label>

    <div class="print-toggle-row">
      <label class="check"
        ><input type="checkbox" v-model="layout.marks.enabled" />裁切线与折标</label
      >
      <label class="check"
        ><input type="checkbox" v-model="layout.showSafeGuides" />安全区参考</label
      >
    </div>

    <div class="print-inline-row">
      <span>底色</span>
      <input
        aria-label="纸张底色"
        class="print-color"
        type="color"
        v-model="layout.paperColor"
      />
    </div>

    <div class="print-divider" />
    <div class="print-label-line">
      <span><Printer :size="13" />目标输出</span>
      <span class="hint">{{ layout.dpi }} dpi</span>
    </div>
    <div class="segmented small print-dpi">
      <button
        v-for="dpi in dpiPresets"
        :key="dpi"
        :class="{ active: layout.dpi === dpi }"
        @click="studio.setDpi(dpi)"
      >
        {{ dpi }}
      </button>
    </div>
    <div class="print-summary">
      <span><Frame :size="12" />成品 {{ studio.estimate.value.trim }}</span>
      <span>出血 {{ studio.estimate.value.bleed }}</span>
      <span>含裁切标记 {{ studio.estimate.value.media }}</span>
    </div>
    <p class="mini">
      版面像素由毫米与 dpi 推导；屏幕缩放只影响观察，不会改变裁切线、出血或跨页位置。
    </p>
  </section>
</template>
