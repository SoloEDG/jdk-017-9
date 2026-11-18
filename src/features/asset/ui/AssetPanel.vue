<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Upload, Image, ArrowUpRight } from "lucide-vue-next";
import type { StudioDocument } from "../../../shared/types";
import { useAssets } from "../model/useAssets";
const props = defineProps<{ doc: StudioDocument }>();
const { load, busy, error } = useAssets(props.doc);
const input = ref<HTMLInputElement>();
function choose(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) void load(f);
  (e.target as HTMLInputElement).value = "";
}
function drop(e: DragEvent) {
  const f = e.dataTransfer?.files[0];
  if (f) void load(f);
}
onMounted(() => load());
</script>
<template>
  <section class="panel asset-panel">
    <div class="section-label"><span>01 / 素材</span><Image :size="15" /></div>
    <h2>从一张全景开始</h2>
    <p class="muted">把辽阔的风景，变成掌心的星球。</p>
    <div
      class="upload-zone"
      @dragover.prevent
      @drop.prevent="drop"
      @click="input?.click()"
      @keydown.enter="input?.click()"
      tabindex="0"
      role="button"
      aria-label="导入全景照片"
    >
      <Upload :size="23" /><strong>{{
        busy ? "正在读取照片…" : "点击或拖入全景照片"
      }}</strong
      ><span>JPG / PNG / WebP · 最大 40 MB</span>
    </div>
    <input
      ref="input"
      hidden
      type="file"
      accept="image/jpeg,image/png,image/webp"
      @change="choose"
    />
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <div v-if="doc.asset" class="source-card">
      <img :src="doc.asset.thumbnail" alt="当前全景原图" />
      <div>
        <strong>{{ doc.asset.name }}</strong
        ><span>{{ doc.asset.width }} × {{ doc.asset.height }} px</span>
      </div>
      <span class="badge">当前素材</span>
    </div>
    <div class="tip">
      建议使用 2:1
      的等距柱状全景，左右首尾相接时效果最佳。普通风景照片也可以探索。
    </div>
    <button class="text-button" @click="load()">
      试试内置山湖示例 <ArrowUpRight :size="14" />
    </button>
  </section>
</template>
