<script setup lang="ts">
import type { Edge } from "../../../shared/types";
defineProps<{ edge: Edge; format: string }>();
</script>
<template>
  <p class="mini" v-if="format === 'jpeg' && edge.transparent">
    JPG 不支持透明，将使用设定的画面底色。
  </p>
  <p class="mini" v-else>
    {{
      edge.transparent
        ? "保留透明通道，可叠放在其他画面上。"
        : "导出包含当前画面底色。"
    }}
  </p>
</template>
