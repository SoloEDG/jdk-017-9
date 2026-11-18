<script setup lang="ts">
import { Blend } from "lucide-vue-next";
import type { StudioDocument } from "../../../shared/types";
import { setSeam, setFeather, setBackground } from "../model/settings";
defineProps<{ doc: StudioDocument }>();
</script>
<template>
  <section class="panel">
    <div class="section-label">
      <span>04 / 边缘处理</span><Blend :size="16" />
    </div>
    <label class="control"
      >接缝融合 <output>{{ Math.round(doc.edge.seam * 100) }}%</output
      ><input
        aria-label="接缝融合"
        type="range"
        min="0"
        max="0.15"
        step="0.005"
        :value="doc.edge.seam"
        @input="
          setSeam(doc.edge, Number(($event.target as HTMLInputElement).value))
        " /></label
    ><label class="control"
      >圆形边缘羽化 <output>{{ Math.round(doc.edge.feather * 100) }}%</output
      ><input
        aria-label="边缘羽化"
        type="range"
        min="0"
        max="0.4"
        step="0.01"
        :value="doc.edge.feather"
        @input="
          setFeather(
            doc.edge,
            Number(($event.target as HTMLInputElement).value),
          )
        "
    /></label>
    <div class="background-row">
      <label
        >画面底色
        <input
          aria-label="画面底色"
          type="color"
          :value="doc.edge.background"
          @input="
            setBackground(doc.edge, ($event.target as HTMLInputElement).value)
          " /></label
      ><label class="check"
        ><input type="checkbox" v-model="doc.edge.transparent" />透明</label
      >
    </div>
    <p class="mini">羽化作用于圆形外缘，预览与导出同步。</p>
  </section>
</template>
