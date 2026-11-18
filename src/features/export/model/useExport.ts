import { ref } from "vue";
import type { StudioDocument, ExportSettings } from "../../../shared/types";
import { encodeImage } from "../lib/encode";
export function useExport(doc: StudioDocument) {
  const busy = ref(false),
    progress = ref(0),
    message = ref("");
  let controller: AbortController | null = null;
  async function download(settings: ExportSettings) {
    if (!doc.asset || busy.value) return;
    busy.value = true;
    progress.value = 0;
    message.value = "";
    controller = new AbortController();
    const snapshot = {
        asset: doc.asset,
        projection: { ...doc.projection },
        edge: { ...doc.edge },
      },
      options = { ...settings };
    try {
      const blob = await encodeImage(
        snapshot,
        options,
        controller.signal,
        (n) => (progress.value = n),
      );
      controller.signal.throwIfAborted();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orbit-${snapshot.projection.mode}-${options.size}.${options.format === "png" ? "png" : "jpg"}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      message.value = "图片已导出，去下载目录看看吧";
    } catch (e) {
      message.value = controller.signal.aborted
        ? "已取消导出"
        : e instanceof Error
          ? e.message
          : "导出失败";
    } finally {
      busy.value = false;
      controller = null;
    }
  }
  return {
    busy,
    progress,
    message,
    download,
    cancel: () => controller?.abort(),
  };
}
