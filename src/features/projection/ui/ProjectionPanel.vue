<script setup lang="ts">
import { Orbit, RotateCcw } from "lucide-vue-next";
import type { StudioDocument } from "../../../shared/types";
import { updateProjection, resetProjection } from "../model/parameters";
const { doc } = defineProps<{ doc: StudioDocument }>();
</script>
<template>
  <section class="panel">
    <div class="section-label"><span>02 / 投影</span><Orbit :size="16" /></div>
    <div class="segmented">
      <button
        :class="{ active: doc.projection.mode === 'planet' }"
        @click="updateProjection(doc.projection, 'mode', 'planet')"
      >
        小行星</button
      ><button
        :class="{ active: doc.projection.mode === 'tunnel' }"
        @click="updateProjection(doc.projection, 'mode', 'tunnel')"
      >
        时空隧道
      </button>
    </div>
    <label class="control"
      >星球尺度 <output>{{ doc.projection.zoom.toFixed(2) }}×</output
      ><input
        aria-label="星球尺度"
        type="range"
        min="0.3"
        max="3"
        step="0.01"
        :value="doc.projection.zoom"
        @input="
          updateProjection(
            doc.projection,
            'zoom',
            ($event.target as HTMLInputElement).value,
          )
        "
    /></label>
    <div class="range-labels"><span>更辽阔</span><span>更紧凑</span></div>
    <button class="text-button" @click="resetProjection(doc.projection)">
      <RotateCcw :size="13" /> 重置投影与取景
    </button>
  </section>
</template>
