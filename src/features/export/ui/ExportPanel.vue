<script setup lang="ts">
import { reactive } from "vue";
import { Download, ArrowDownToLine } from "lucide-vue-next";
import type { StudioDocument, ExportSettings } from "../../../shared/types";
import { MatteNotice } from "../../edge";
import { useExport } from "../model/useExport";
import { outputSizes, estimatedMemory } from "../lib/settings";
const { doc } = defineProps<{ doc: StudioDocument }>();
const settings = reactive<ExportSettings>({
  size: 2048,
  format: "png",
  quality: 0.92,
});
const { busy, progress, message, download, cancel } = useExport(doc);
</script>
<template>
  <section class="panel export-panel" id="export-panel">
    <div class="section-label">
      <span>05 / 导出作品</span><Download :size="16" />
    </div>
    <label class="field-label" for="size">输出尺寸</label
    ><select
      id="size"
      aria-label="输出尺寸"
      v-model="settings.size"
      :disabled="busy"
    >
      <option v-for="size in outputSizes" :value="size.value">
        {{ size.label }} · {{ size.hint }}
      </option>
    </select>
    <div class="format-row">
      <span>图片格式</span>
      <div class="segmented small">
        <button
          :disabled="busy"
          :class="{ active: settings.format === 'png' }"
          @click="settings.format = 'png'"
        >
          PNG</button
        ><button
          :disabled="busy"
          :class="{ active: settings.format === 'jpeg' }"
          @click="settings.format = 'jpeg'"
        >
          JPG
        </button>
      </div>
    </div>
    <label v-if="settings.format === 'jpeg'" class="control"
      >图片质量 <output>{{ Math.round(settings.quality * 100) }}%</output
      ><input
        aria-label="图片质量"
        type="range"
        min="0.5"
        max="1"
        step="0.01"
        v-model.number="settings.quality" /></label
    ><MatteNotice :edge="doc.edge" :format="settings.format" /><button
      class="primary export-button"
      :disabled="!doc.asset || busy"
      @click="download(settings)"
    >
      <ArrowDownToLine :size="16" />{{
        busy ? `正在导出 ${Math.round(progress * 100)}%` : "导出我的星球"
      }}<span v-if="!busy">↗</span></button
    ><button v-if="busy" class="text-button" @click="cancel">取消导出</button>
    <p v-if="message" role="status" class="mini">{{ message }}</p>
    <p class="export-foot">
      预估像素内存 {{ estimatedMemory(settings) }} MB · 构图不随尺寸改变
    </p>
  </section>
</template>
