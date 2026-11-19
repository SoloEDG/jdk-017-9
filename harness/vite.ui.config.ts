import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  plugins: [vue()],
  build: {
    target: "esnext",
    lib: {
      entry: resolve(here, "tests/ui.test.mjs"),
      formats: ["es"],
      fileName: () => "ui-test.js",
    },
    outDir: resolve(here, "ui-dist"),
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      external: [
        "jsdom",
        "@napi-rs/canvas",
        "vue",
        /^node:/,
      ],
    },
  },
});
