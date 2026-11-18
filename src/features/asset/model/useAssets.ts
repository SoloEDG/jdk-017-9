import { ref, markRaw } from "vue";
import type { StudioDocument } from "../../../shared/types";
import { decodeAsset } from "../lib/decode";
import { loadDemo } from "../lib/demo";
export function useAssets(doc: StudioDocument) {
  const busy = ref(false),
    error = ref("");
  let revision = 0;
  async function load(file?: File) {
    const ticket = ++revision;
    busy.value = true;
    error.value = "";
    try {
      const asset = file
        ? await decodeAsset(file, file.name)
        : await loadDemo();
      if (ticket === revision) doc.asset = markRaw(asset);
    } catch (e) {
      if (ticket === revision)
        error.value = e instanceof Error ? e.message : "无法读取图片";
    } finally {
      if (ticket === revision) busy.value = false;
    }
  }
  return { busy, error, load };
}
