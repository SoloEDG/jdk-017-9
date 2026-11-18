import { decodeAsset } from "./decode";
export async function loadDemo() {
  const response = await fetch("/panorama.jpg");
  if (!response.ok) throw new Error("示例图片加载失败，请导入本地照片");
  return decodeAsset(await response.blob(), "山湖之间 · Alpine lake");
}
