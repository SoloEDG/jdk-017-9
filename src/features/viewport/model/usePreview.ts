import { watch, onBeforeUnmount, type Ref, ref } from "vue";
import type { StudioDocument } from "../../../shared/types";
import { renderPreview } from "../../projection";
export function usePreview(
  doc: StudioDocument,
  canvas: Ref<HTMLCanvasElement | undefined>,
) {
  const rendering = ref(false);
  let frame = 0;
  watch(
    () => [
      canvas.value,
      doc.asset,
      JSON.stringify(doc.projection),
      JSON.stringify(doc.edge),
    ],
    () => {
      cancelAnimationFrame(frame);
      rendering.value = true;
      frame = requestAnimationFrame(() => {
        if (canvas.value && doc.asset)
          renderPreview(
            canvas.value,
            {
              asset: doc.asset,
              projection: { ...doc.projection },
              edge: { ...doc.edge },
            },
            600,
          );
        rendering.value = false;
      });
    },
    { immediate: true, flush: "post" },
  );
  onBeforeUnmount(() => cancelAnimationFrame(frame));
  return { rendering };
}
