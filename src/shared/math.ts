export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
export const wrap = (v: number, period = 1) => ((v % period) + period) % period;
export const radians = (degrees: number) => (degrees * Math.PI) / 180;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
