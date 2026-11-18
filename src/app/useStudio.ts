import { reactive } from "vue";
import type { StudioDocument } from "../shared/types";
import { defaultEdge, defaultProjection } from "../shared/defaults";
export function useStudio() {
  return reactive<StudioDocument>({
    asset: null,
    projection: defaultProjection(),
    edge: defaultEdge(),
  });
}
