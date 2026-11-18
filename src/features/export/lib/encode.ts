import type { ExportSettings, RenderSnapshot } from "../../../shared/types";
import { renderRows } from "../../projection";
export async function encodeImage(
  snapshot: RenderSnapshot,
  settings: ExportSettings,
  signal: AbortSignal,
  progress: (n: number) => void,
) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = settings.size;
  const ctx = canvas.getContext("2d")!;
  const s = {
    ...snapshot,
    edge: {
      ...snapshot.edge,
      transparent: settings.format === "png" && snapshot.edge.transparent,
    },
  };
  // Use strips to bound working memory and let cancellation interrupt between strips.
  for (let y = 0; y < settings.size; y += 24) {
    signal.throwIfAborted();
    const end = Math.min(y + 24, settings.size);
    const image = ctx.createImageData(settings.size, end - y);
    renderRows(s, image, y, end, y, settings.size);
    ctx.putImageData(image, 0, y);
    progress(end / settings.size);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  signal.throwIfAborted();
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("图片编码失败"))),
      settings.format === "png" ? "image/png" : "image/jpeg",
      settings.quality,
    ),
  );
}
