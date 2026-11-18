<script setup lang="ts">
import { Orbit, ArrowUpRight, Camera, ChevronRight } from "lucide-vue-next";
import { AssetPanel } from "../features/asset";
import { ProjectionPanel } from "../features/projection";
import { ViewportPanel, ViewControls } from "../features/viewport";
import { EdgePanel } from "../features/edge";
import { ExportPanel } from "../features/export";
import { useStudio } from "./useStudio";
const doc = useStudio();
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
      <div class="top-center">让你的世界，自成一颗星球 <span>✦</span></div>
      <a class="top-action" href="#export-panel"
        >导出作品 <ArrowUpRight :size="16"
      /></a>
    </header>
    <div class="breadcrumb">
      <Camera :size="14" /><span>创作空间</span
      ><ChevronRight :size="13" /><strong>未命名的星球</strong
      ><span class="local-tag">本地处理 · 照片无需上传</span>
    </div>
    <div class="studio-grid">
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
    <footer>
      <span><i />所有图像均在你的浏览器中处理</span
      ><span>ORBIT STUDIO <b>© 2026</b></span
      ><span>一点好奇，一整个世界。 ↗</span>
    </footer>
  </div>
</template>
