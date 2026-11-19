<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Layers,
  Lock,
  Unlock,
  Plus,
  Trash2,
  AlertTriangle,
  Sparkles,
  Check,
  X,
} from "lucide-vue-next";
import type { StudioDocument } from "../../../shared/types";
import type { PrintStudio } from "../model/usePrint";

const props = defineProps<{ studio: PrintStudio; doc: StudioDocument }>();
const layout = props.studio.layout;
const editing = computed(() => props.studio.editing.value);
const comp = computed(() => props.studio.activeComp.value);
const confirmFrames = computed(() => props.studio.confirmFrames.value);
const confirmOpen = computed(() => Boolean(props.studio.confirmEditId.value));
const showAdvanced = ref(false);

function value(event: Event) {
  return (event.target as HTMLInputElement).value;
}

function setProjection(key: "zoom" | "yaw" | "pitch" | "roll", event: Event) {
  props.studio.updateCompositionProjection(key, Number(value(event)));
}

function rename(event: Event) {
  const name = value(event).trim();
  if (name && comp.value) comp.value.name = name;
}
</script>

<template>
  <section class="panel print-panel">
    <div class="section-label">
      <span>08 / 作品构图</span><Layers :size="16" />
    </div>

    <div class="print-inline-row">
      <span>构图</span>
      <select
        aria-label="选择构图"
        :value="comp?.id"
        @change="studio.focusComposition(($event.target as HTMLSelectElement).value)"
      >
        <option
          v-for="composition in layout.compositions"
          :key="composition.id"
          :value="composition.id"
        >
          {{ composition.name }}
        </option>
      </select>
    </div>

    <div class="print-frame-actions">
      <button class="text-button" @click="studio.createComposition(true)">
        <Plus :size="13" /> 新建并指派
      </button>
      <button
        class="text-button danger"
        :disabled="layout.compositions.length <= 1"
        @click="studio.deleteComposition()"
      >
        <Trash2 :size="13" /> 删除
      </button>
    </div>

    <template v-if="comp">
      <label class="field-label">构图名称</label>
      <input
        class="print-text-input"
        :value="comp.name"
        aria-label="构图名称"
        @change="rename"
      />

      <div class="print-usage-line">
        <Lock v-if="studio.activeUsage.value > 1 && !editing" :size="12" />
        <Unlock v-else :size="12" />
        <span>
          {{ studio.activeUsage.value }} 个图框引用此构图<template
            v-if="studio.activeUsage.value > 1"
            >，修改前需确认受影响图框</template
          >
        </span>
      </div>

      <button
        v-if="!editing"
        class="print-wide-button"
        @click="studio.requestCompositionEdit()"
      >
        {{ studio.activeUsage.value > 1 ? "编辑共享构图…" : "编辑此构图" }}
      </button>
      <button v-else class="print-wide-button secondary" @click="studio.cancelCompositionEdit()">
        <Check :size="13" /> 结束编辑
      </button>

      <div v-if="confirmOpen" class="print-confirm">
        <div class="print-confirm-head">
          <AlertTriangle :size="15" />
          <strong>以下 {{ confirmFrames.length }} 个图框会一起改变</strong>
        </div>
        <ul>
          <li v-for="frame in confirmFrames" :key="frame.id">
            {{ frame.name }}
            <span>{{ Math.round(frame.widthMm) }}×{{ Math.round(frame.heightMm) }} mm</span>
          </li>
        </ul>
        <p class="mini">
          它们引用同一构图。取景与位置各自保留，画面内容会同步更新。
        </p>
        <div class="print-confirm-actions">
          <button class="primary" @click="studio.confirmCompositionEdit()">
            继续编辑
          </button>
          <button class="text-button" @click="studio.cancelCompositionEdit()">
            <X :size="13" /> 取消
          </button>
        </div>
      </div>

      <fieldset class="print-fieldset" :disabled="!editing">
        <div class="segmented">
          <button
            :class="{ active: comp.projection.mode === 'planet' }"
            @click="studio.updateCompositionProjection('mode', 'planet')"
          >
            小行星</button
          ><button
            :class="{ active: comp.projection.mode === 'tunnel' }"
            @click="studio.updateCompositionProjection('mode', 'tunnel')"
          >
            隧道
          </button>
        </div>
        <label class="control"
          >星球尺度 <output>{{ comp.projection.zoom.toFixed(2) }}×</output
          ><input
            aria-label="构图星球尺度"
            type="range"
            min="0.3"
            max="3"
            step="0.01"
            :value="comp.projection.zoom"
            @input="setProjection('zoom', $event)"
        /></label>
        <label class="control"
          >水平旋转 <output>{{ Math.round(comp.projection.yaw) }}°</output
          ><input
            aria-label="构图水平旋转"
            type="range"
            min="0"
            max="359"
            step="1"
            :value="comp.projection.yaw"
            @input="setProjection('yaw', $event)"
        /></label>
        <label class="control"
          >俯仰 <output>{{ Math.round(comp.projection.pitch) }}°</output
          ><input
            aria-label="构图俯仰"
            type="range"
            min="-85"
            max="85"
            step="1"
            :value="comp.projection.pitch"
            @input="setProjection('pitch', $event)"
        /></label>
        <label class="control"
          >画面旋转 <output>{{ Math.round(comp.projection.roll) }}°</output
          ><input
            aria-label="构图画面旋转"
            type="range"
            min="0"
            max="359"
            step="1"
            :value="comp.projection.roll"
            @input="setProjection('roll', $event)"
        /></label>
        <label class="control"
          >边缘羽化 <output>{{ Math.round(comp.edge.feather * 100) }}%</output
          ><input
            aria-label="构图边缘羽化"
            type="range"
            min="0"
            max="0.4"
            step="0.01"
            :value="comp.edge.feather"
            @input="studio.updateCompositionEdge('feather', Number(value($event)))"
        /></label>
        <div class="background-row">
          <label
            >画面底色
            <input
              aria-label="构图画面底色"
              type="color"
              :value="comp.edge.background"
              @input="studio.updateCompositionEdge('background', value($event))"
          /></label>
          <label class="check"
            ><input
              type="checkbox"
              :checked="comp.edge.transparent"
              @change="
                studio.updateCompositionEdge(
                  'transparent',
                  ($event.target as HTMLInputElement).checked,
                )
              "
            />透明</label
          >
        </div>
      </fieldset>
      <p v-if="!editing" class="mini">
        参数只读。点击上方按钮后编辑，改变会按确认列表同步到所有引用图框。
      </p>

      <button class="text-button" @click="showAdvanced = !showAdvanced">
        <Sparkles :size="13" /> {{ showAdvanced ? "收起" : "从实时画面取景" }}
      </button>
      <button
        v-if="showAdvanced"
        class="text-button"
        :disabled="!editing"
        @click="studio.syncCompositionFromLive()"
      >
        采用当前实时预览的投影与边缘
      </button>
    </template>
  </section>
</template>
