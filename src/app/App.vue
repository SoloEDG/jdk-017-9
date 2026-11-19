<script setup lang="ts">
import { Orbit, ArrowUpRight, Camera, ChevronRight } from "lucide-vue-next";
import { ref } from "vue";
import { AssetPanel } from "../features/asset";
import { ProjectionPanel } from "../features/projection";
import { ViewportPanel, ViewControls } from "../features/viewport";
import { EdgePanel } from "../features/edge";
import { ExportPanel } from "../features/export";
import { PrintWorkspace } from "../features/print";
import { useStudio } from "./useStudio";
const doc = useStudio();
const mode = ref<"studio" | "print">("studio");
</script>
<template>
  <div class="workspace">
    <header class="topbar">
      <a class="brand" href="/" aria-label="ORBIT 首页"
        ><span class="brand-icon"><Orbit :size="25" /></span>ORBIT<span
          class="brand-tag"
          >小行星工作室</span
        ></a
      >
      <nav class="mode-switch" aria-label="工作模式">
        <button
          :class="{ active: mode === 'studio' }"
          @click="mode = 'studio'"
        >
          星球创作</button
        ><button :class="{ active: mode === 'print' }" @click="mode = 'print'">
          印刷版面
        </button>
      </nav>
      <div class="top-center">让你的世界，自成一颗星球 <span>✦</span></div>
      <a
        v-if="mode === 'studio'"
        class="top-action"
        href="#export-panel"
        @click="mode = 'print'"
        >实体卡片 <ArrowUpRight :size="16"
      /></a>
      <a v-else class="top-action" href="#print-export"
        >导出印刷 PDF <ArrowUpRight :size="16"
      /></a>
    </header>
    <div class="breadcrumb">
      <Camera :size="14" /><span>创作空间</span
      ><ChevronRight :size="13" /><strong>{{
        mode === "studio" ? "未命名的星球" : "印刷版面"
      }}</strong
      ><span class="local-tag">本地处理 · 照片无需上传</span>
    </div>
    <div v-if="mode === 'studio'" class="studio-grid">
      <aside class="left-sidebar">
        <AssetPanel :doc="doc" /><ProjectionPanel :doc="doc" />
        <div class="sidebar-note">
          <span>THE WORLD, REIMAGINED.</span>
          <p>把远方，装进一颗星球。</p>
          <span>✳ &nbsp; MADE FOR YOUR PERSPECTIVE</span>
        </div>
      </aside>
      <ViewportPanel :doc="doc" />
      <aside class="right-sidebar">
        <ViewControls :doc="doc" /><EdgePanel :doc="doc" /><ExportPanel
          :doc="doc"
        />
      </aside>
    </div>
    <PrintWorkspace v-else :doc="doc" />
    <footer>
      <span><i />所有图像均在你的浏览器中处理</span
      ><span>ORBIT STUDIO <b>© 2026</b></span
      ><span>一点好奇，一整个世界。 ↗</span>
    </footer>
  </div>
</template>
