import type { Asset } from "../../../shared/types";
export async function decodeAsset(blob: Blob, name: string): Promise<Asset> {
  if (blob.size > 40 * 1024 * 1024)
    throw new Error("图片超过 40 MB，请先缩小后导入");
  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width < 128 || bitmap.height < 64)
      throw new Error("图片太小，至少需要 128 × 64 像素");
    const scale = Math.min(1, 4096 / bitmap.width, 2048 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const thumb = document.createElement("canvas");
    thumb.width = 240;
    thumb.height = 120;
    thumb.getContext("2d")!.drawImage(canvas, 0, 0, 240, 120);
    return {
      id: crypto.randomUUID(),
      name,
      width: canvas.width,
      height: canvas.height,
      data,
      thumbnail: thumb.toDataURL("image/jpeg", 0.7),
    };
  } finally {
    bitmap.close();
  }
}
