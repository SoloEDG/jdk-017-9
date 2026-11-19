import { reactive } from "vue";
import type { StudioDocument } from "../shared/types";
import { defaultEdge, defaultProjection } from "../shared/defaults";
import { defaultPrintLayout } from "../shared/print/defaults";
export function useStudio() {
  const doc = reactive<StudioDocument>({
    asset: null,
    projection: defaultProjection(),
    edge: defaultEdge(),
    print: defaultPrintLayout(),
    actions: {
      setProjection(patch) {
        Object.assign(doc.projection, patch);
      },
      setEdge(patch) {
        Object.assign(doc.edge, patch);
      },
    },
  });
  return doc;
}
