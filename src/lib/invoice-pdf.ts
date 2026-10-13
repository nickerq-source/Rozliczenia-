import fs from "node:fs";
import path from "node:path";
import type { InvoicePDFPage } from "./invoice-table";

/** Server-only extraction. Keep cell coordinates until table parsing is finished. */
export async function extractInvoicePages(buffer: Uint8Array): Promise<InvoicePDFPage[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjs = require("pdfjs-dist/legacy/build/pdf.js") as typeof import("pdfjs-dist");
  const root = path.join(process.cwd(), "node_modules", "pdfjs-dist");
  const worker = path.join(root, "legacy", "build", "pdf.worker.js");
  if (fs.existsSync(worker)) pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const fonts = path.join(root, "standard_fonts") + path.sep;
  const cmaps = path.join(root, "cmaps") + path.sep;
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    ...(fs.existsSync(fonts) && fs.existsSync(cmaps)
      ? { standardFontDataUrl: fonts, cMapUrl: cmaps } : {}),
    cMapPacked: true,
    useSystemFonts: false,
    disableFontFace: true,
    isEvalSupported: false,
    verbosity: 0,
  });
  try {
    const pdf = await task.promise;
    const pages: InvoicePDFPage[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push({ pageNumber, items: content.items.flatMap((item) =>
        "str" in item && item.str.trim() ? [{
          text: item.str, x: item.transform[4], y: item.transform[5],
          width: item.width, height: item.height,
        }] : []) });
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
