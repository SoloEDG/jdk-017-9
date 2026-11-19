/**
 * Minimal PDF 1.7 writer. Every page is assembled from vector operators plus
 * DCT (JPEG) image XObjects, so crop marks and text never pass through a
 * full-page raster. Coordinates are supplied in PDF points.
 */

export interface PdfImage {
  width: number;
  height: number;
  data: Uint8Array;
  /** Optional deflated 8-bit alpha mask; keeps frame rims truly transparent. */
  mask?: Uint8Array;
}

export class PdfBuilder {
  private encoder = new TextEncoder();
  private objects: (Uint8Array | null)[] = [null];

  reserve() {
    this.objects.push(null);
    return this.objects.length - 1;
  }

  set(id: number, body: string | Uint8Array) {
    this.objects[id] =
      typeof body === "string" ? this.encoder.encode(body) : body;
  }

  add(body: string | Uint8Array) {
    const id = this.reserve();
    this.set(id, body);
    return id;
  }

  addStream(dict: string, data: Uint8Array) {
    const id = this.reserve();
    const head = this.encoder.encode(
      `${dict.replace(/>>\s*$/, "")} /Length ${data.length} >>\nstream\n`,
    );
    const tail = this.encoder.encode("\nendstream");
    const body = new Uint8Array(head.length + data.length + tail.length);
    body.set(head, 0);
    body.set(data, head.length);
    body.set(tail, head.length + data.length);
    this.set(id, body);
    return id;
  }

  finish(rootId: number, infoId?: number): Blob {
    const parts: Uint8Array[] = [];
    let offset = 0;
    const push = (chunk: string | Uint8Array) => {
      const bytes =
        typeof chunk === "string" ? this.encoder.encode(chunk) : chunk;
      parts.push(bytes);
      offset += bytes.length;
    };
    const offsets: number[] = new Array(this.objects.length).fill(0);
    push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]));
    push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    for (let id = 1; id < this.objects.length; id++) {
      const body = this.objects[id];
      offsets[id] = offset;
      push(`${id} 0 obj\n`);
      if (body) push(body);
      push("\nendobj\n");
    }
    const xrefOffset = offset;
    push(`xref\n0 ${this.objects.length}\n`);
    push("0000000000 65535 f \n");
    for (let id = 1; id < this.objects.length; id++)
      push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
    const info = infoId ? ` /Info ${infoId} 0 R` : "";
    push(
      `trailer\n<< /Size ${this.objects.length} /Root ${rootId} 0 R${info} >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    );
    return new Blob(parts as BlobPart[], { type: "application/pdf" });
  }
}

export interface PdfPageImage {
  image: PdfImage;
  /** Placement rectangle in PDF points, origin bottom-left. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPageText {
  text: string;
  x: number;
  y: number;
  size: number;
  color?: [number, number, number];
  bold?: boolean;
}

export interface PdfPageLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  color?: [number, number, number];
}

export interface PdfPageRect {
  x: number;
  y: number;
  width: number;
  height: number;
  stroke?: [number, number, number];
  fill?: [number, number, number];
  lineWidth?: number;
  dash?: number[];
}

export interface PdfPage {
  width: number;
  height: number;
  trim?: { x: number; y: number; width: number; height: number };
  bleed?: { x: number; y: number; width: number; height: number };
  images: PdfPageImage[];
  lines: PdfPageLine[];
  rects: PdfPageRect[];
  texts: PdfPageText[];
}

const n = (value: number) => {
  const rounded = Math.round(value * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
};

const colorOp = (color: [number, number, number], stroke: boolean) =>
  `${n(color[0])} ${n(color[1])} ${n(color[2])} ${stroke ? "RG" : "rg"}`;

/* Built-in Type1 faces only cover Latin-1, so labels are ASCII-safe. */
const ascii = (text: string) => text.replace(/[^\x20-\x7e]/g, "?");

export const pdfString = (value: string) =>
  `(${ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;

function buildContent(page: PdfPage) {
  const ops: string[] = [];
  // Paint order: page backgrounds first, then artwork, then vector guides.
  for (const rect of page.rects) {
    if (!rect.fill) continue;
    ops.push("q", colorOp(rect.fill, false));
    ops.push(
      `${n(rect.x)} ${n(rect.y)} ${n(rect.width)} ${n(rect.height)} re f`,
      "Q",
    );
  }
  for (let i = 0; i < page.images.length; i++) {
    const item = page.images[i];
    ops.push(
      "q",
      `${n(item.width)} 0 0 ${n(item.height)} ${n(item.x)} ${n(item.y)} cm`,
      `/Im${i + 1} Do`,
      "Q",
    );
  }
  for (const rect of page.rects) {
    if (!rect.stroke) continue;
    const dash =
      rect.dash && rect.dash.length
        ? `[${rect.dash.map(n).join(" ")}] 0 d`
        : "[] 0 d";
    ops.push(
      "q",
      colorOp(rect.stroke, true),
      `${n(rect.lineWidth ?? 0.25)} w`,
      dash,
      `${n(rect.x)} ${n(rect.y)} ${n(rect.width)} ${n(rect.height)} re S`,
      "Q",
    );
  }
  for (const line of page.lines) {
    ops.push(
      "q",
      colorOp(line.color ?? [0, 0, 0], true),
      `${n(line.width)} w`,
      "1 J",
      `${n(line.x1)} ${n(line.y1)} m ${n(line.x2)} ${n(line.y2)} l S`,
      "Q",
    );
  }
  for (const text of page.texts) {
    ops.push(
      "BT",
      text.bold ? "/F2" : "/F1",
      `${n(text.size)} Tf`,
      colorOp(text.color ?? [0, 0, 0], false),
      `1 0 0 1 ${n(text.x)} ${n(text.y)} Tm`,
      `(${ascii(text.text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")}) Tj`,
      "ET",
    );
  }
  return ops.join("\n");
}

export async function buildPdf(
  pages: PdfPage[],
  meta: { title: string; subject?: string },
): Promise<Blob> {
  const pdf = new PdfBuilder();
  const catalogId = pdf.reserve();
  const pagesId = pdf.reserve();
  const fontId = pdf.add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  const fontBoldId = pdf.add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );

  const pageIds: number[] = [];
  for (const page of pages) {
    const imageIds = page.images.map((item) => {
      let smask = "";
      if (item.image.mask) {
        const maskId = pdf.addStream(
          `<< /Type /XObject /Subtype /Image /Width ${item.image.width} /Height ${item.image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode >>`,
          item.image.mask,
        );
        smask = ` /SMask ${maskId} 0 R`;
      }
      return pdf.addStream(
        `<< /Type /XObject /Subtype /Image /Width ${item.image.width} /Height ${item.image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode${smask} >>`,
        item.image.data,
      );
    });
    const content = buildContent(page);
    const contentId = pdf.addStream("<< >>", new TextEncoder().encode(content));
    const xobjects = imageIds
      .map((id, index) => `/Im${index + 1} ${id} 0 R`)
      .join(" ");
    const boxes: string[] = [];
    if (page.trim)
      boxes.push(
        `/TrimBox [${n(page.trim.x)} ${n(page.trim.y)} ${n(page.trim.x + page.trim.width)} ${n(page.trim.y + page.trim.height)}]`,
      );
    if (page.bleed)
      boxes.push(
        `/BleedBox [${n(page.bleed.x)} ${n(page.bleed.y)} ${n(page.bleed.x + page.bleed.width)} ${n(page.bleed.y + page.bleed.height)}]`,
      );
    const pageId = pdf.add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n(page.width)} ${n(page.height)}] ${boxes.join(" ")} /Resources << /Font << /F1 ${fontId} 0 R /F2 ${fontBoldId} 0 R >> /XObject << ${xobjects} >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }

  const infoId = pdf.add(
    `<< /Title ${pdfString(meta.title)} /Subject ${pdfString(meta.subject ?? "")} /Producer (ORBIT Studio) /Creator (ORBIT Studio) >>`,
  );
  pdf.set(pagesId, `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`);
  pdf.set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  return pdf.finish(catalogId, infoId);
}
