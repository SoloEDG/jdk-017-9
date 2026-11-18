import type { Asset } from "../../../shared/types";
import { clamp, wrap, smoothstep } from "../../../shared/math";
function bilinear(asset: Asset, u: number, v: number) {
  const x = wrap(u) * asset.width - 0.5,
    y = clamp(v * asset.height - 0.5, 0, asset.height - 1),
    x0 = Math.floor(x),
    y0 = Math.floor(y),
    fx = x - x0,
    fy = y - y0;
  const out = [0, 0, 0, 0];
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 2; i++) {
      const at =
        (Math.min(y0 + j, asset.height - 1) * asset.width +
          wrap(x0 + i, asset.width)) *
        4;
      const weight = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
      for (let c = 0; c < 4; c++) out[c] += asset.data.data[at + c] * weight;
    }
  return out;
}
export function sample(asset: Asset, u: number, v: number, seam: number) {
  const original = bilinear(asset, u, v);
  if (seam <= 0) return original;
  const d = Math.min(u, 1 - u);
  if (d >= seam) return original;
  const opposite = bilinear(asset, 1 - u, v),
    mix = (1 - smoothstep(0, seam, d)) * 0.5;
  return original.map((n, i) => n * (1 - mix) + opposite[i] * mix);
}
