// UI behaviour regressions rendered in jsdom. Skips when jsdom is missing.
import { JSDOM } from "jsdom";
import { createCanvas, ImageData as NodeImageData } from "@napi-rs/canvas";

const dom = new JSDOM(
  "<!doctype html><html><body><div id='app'></div></body></html>",
  { pretendToBeVisual: true, url: "http://localhost/" },
);
const win = dom.window;
const seen = new WeakMap();
win.HTMLCanvasElement.prototype.getContext = function (type) {
  if (!seen.has(this)) seen.set(this, createCanvas(this.width || 1, this.height || 1));
  const backing = seen.get(this);
  if (backing.width !== (this.width || 1) || backing.height !== (this.height || 1)) {
    backing.width = this.width || 1;
    backing.height = this.height || 1;
  }
  return backing.getContext(type);
};
win.HTMLCanvasElement.prototype.toBlob = function (callback, type = "image/png", quality) {
  const backing = seen.get(this);
  const q = type === "image/jpeg" && quality !== undefined ? quality * 100 : undefined;
  callback(new Blob([backing.toBuffer(type, q)], { type }));
};
win.HTMLCanvasElement.prototype.toDataURL = function (type = "image/png") {
  return `data:${type};base64,${seen.get(this).toBuffer(type).toString("base64")}`;
};
win.ImageData = NodeImageData;
win.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
win.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
win.cancelAnimationFrame = (id) => clearTimeout(id);
win.matchMedia = () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
});

for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLCanvasElement",
  "HTMLInputElement",
  "SVGElement",
  "Node",
  "Element",
  "Text",
  "DocumentFragment",
  "ImageData",
  "ResizeObserver",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "crypto",
  "getComputedStyle",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "Blob",
  "URL",
  "Image",
]) {
  if (win[key] === undefined) continue;
  Object.defineProperty(globalThis, key, {
    value: win[key],
    configurable: true,
    writable: true,
  });
}
Object.defineProperty(globalThis, "devicePixelRatio", {
  value: 1,
  configurable: true,
});
Object.defineProperty(globalThis, "PointerEvent", {
  value: win.MouseEvent,
  configurable: true,
});

const failures = [];
function check(name, condition, detail) {
  if (!condition) failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${condition ? "PASS" : "FAIL"} ${name}`);
}
const tick = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

const { createApp, nextTick } = await import("vue");
const App = (await import("../../src/app/App.vue")).default;
const root = win.document.getElementById("app");
const app = createApp(App);
app.config.errorHandler = (error) => {
  failures.push(`app error — ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL app error", error);
};
app.mount(root);
await tick(300);
await nextTick();

const buttons = () => [...root.querySelectorAll("button")];
check("both modes offered", root.innerHTML.includes("印刷版面"));

buttons()
  .find((b) => b.textContent?.includes("印刷版面"))
  ?.click();
await tick(500);
await nextTick();

const canvas = root.querySelector("canvas.print-canvas");
check("print canvas mounted", Boolean(canvas));
check("frame list rendered", root.querySelectorAll(".frame-list li").length === 1);
check("physical caption shows millimetres", /mm/.test(root.querySelector(".print-stage-caption")?.textContent ?? ""));

// Frame creation and shape editing.
buttons()
  .find((b) => b.textContent?.includes("新建图框"))
  ?.click();
await nextTick();
check("new frame appended", root.querySelectorAll(".frame-list li").length === 2);

buttons()
  .find((b) => b.textContent?.trim() === "矩形")
  ?.click();
await nextTick();
const heightInput = root.querySelector("input[aria-label=图框高度]");
check("rect frames unlock height", heightInput && !heightInput.disabled);

// Shared composition editing must show the affected frames first.
buttons()
  .find((b) => b.textContent?.includes("新建并指派"))
  ?.click();
await nextTick();
check("new composition created", root.innerHTML.includes("构图 2"));

// Point the first frame at the new composition so both share it.
root.querySelectorAll(".frame-list li")[0]?.dispatchEvent(
  new win.MouseEvent("click", { bubbles: true }),
);
await nextTick();
const compositionSelect = root.querySelector("select[aria-label=图框引用构图]");
const newCompositionId = [...compositionSelect.options].at(-1).value;
compositionSelect.value = newCompositionId;
compositionSelect.dispatchEvent(new win.Event("change", { bubbles: true }));
await tick(120);
check("shared composition usage reported", root.innerHTML.includes("2 个图框引用此构图"));
buttons()
  .find((b) => b.textContent?.includes("编辑共享构图"))
  ?.click();
await nextTick();
check(
  "affected frames listed before editing",
  root.innerHTML.includes("会一起改变") && root.innerHTML.includes("受影响"),
);
buttons()
  .find((b) => b.textContent?.includes("继续编辑"))
  ?.click();
await nextTick();
const compositionZoom = root.querySelector("input[aria-label=构图星球尺度]");
check(
  "composition controls unlock after confirmation",
  compositionZoom && !compositionZoom.closest("fieldset")?.disabled,
);

// Screen zoom changes only the canvas size, never the physical caption.
const caption = () =>
  (root.querySelector(".print-stage-caption")?.textContent ?? "").split("·")[0];
const beforeCaption = caption();
const beforeWidth = root.querySelector("canvas.print-canvas").style.width;
buttons()
  .find((b) => b.getAttribute("aria-label") === "放大版面")
  ?.click();
await tick(150);
check("screen zoom preserves physical caption", caption() === beforeCaption, beforeCaption);
check(
  "screen zoom resizes canvas",
  root.querySelector("canvas.print-canvas").style.width !== beforeWidth,
);

// Safe-zone overflow surfaces in the frame list and export panel.
const widthField = root.querySelector("input[aria-label=图框宽度]");
widthField.value = "400";
widthField.dispatchEvent(new win.Event("change", { bubbles: true }));
await tick(120);
check("overflow flagged after resizing", root.innerHTML.includes("超出安全区"));

app.unmount();
await tick(50);

if (failures.length) {
  console.error(`\n${failures.length} UI check(s) failed`);
  process.exit(1);
}
console.log("\nAll UI checks passed");
