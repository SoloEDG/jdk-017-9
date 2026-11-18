import type { RenderSnapshot } from "../../../shared/types";
import { projectPoint } from "./coordinates";
import { sample } from "./sampling";
import { applyEdge } from "../../edge";
export function renderRows(
  s: RenderSnapshot,
  image: ImageData,
  start: number,
  end: number,
  offset = 0,
  fullHeight = image.height,
) {
  for (let y = start; y < end; y++)
    for (let x = 0; x < image.width; x++) {
      const uv = projectPoint(
        x + 0.5,
        y + 0.5,
        image.width,
        fullHeight,
        s.projection,
      );
      const rgba = sample(s.asset, uv.u, uv.v, s.edge.seam);
      const result = applyEdge(
        rgba,
        x + 0.5,
        y + 0.5,
        image.width,
        fullHeight,
        s.edge,
      );
      const at = ((y - offset) * image.width + x) * 4;
      for (let c = 0; c < 4; c++) image.data[at + c] = result[c];
    }
}
export function renderPreview(
  canvas: HTMLCanvasElement,
  s: RenderSnapshot,
  size: number,
) {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);
  renderRows(s, image, 0, size);
  ctx.putImageData(image, 0, 0);
}
