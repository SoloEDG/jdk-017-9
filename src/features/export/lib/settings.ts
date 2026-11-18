import type { ExportSettings } from "../../../shared/types";
export const outputSizes = [
  { value: 1024, label: "标准", hint: "1024 × 1024" },
  { value: 2048, label: "高清", hint: "2048 × 2048" },
  { value: 4096, label: "超清", hint: "4096 × 4096" },
];
export function estimatedMemory(settings: ExportSettings) {
  return Math.ceil((settings.size ** 2 * 4) / 1024 ** 2);
}
