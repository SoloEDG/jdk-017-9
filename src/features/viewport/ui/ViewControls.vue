<script setup lang="ts">
import type { StudioDocument } from "../../../shared/types";
import { updateProjection } from "../../projection";
defineProps<{ doc: StudioDocument }>();
const controls = [
  { key: "yaw", label: "水平旋转", min: 0, max: 359 },
  { key: "pitch", label: "俯仰角度", min: -85, max: 85 },
  { key: "roll", label: "画面旋转", min: 0, max: 359 },
] as const;
</script>
<template>
  <section class="panel">
    <div class="section-label"><span>03 / 旋转取景</span><span>↗</span></div>
    <label v-for="c in controls" :key="c.key" class="control"
      >{{ c.label }}<output>{{ Math.round(doc.projection[c.key]) }}°</output
      ><input
        :aria-label="c.label"
        type="range"
        :min="c.min"
        :max="c.max"
        step="1"
        :value="doc.projection[c.key]"
        @input="
          updateProjection(
            doc.projection,
            c.key,
            ($event.target as HTMLInputElement).value,
          )
        "
    /></label>
  </section>
</template>
