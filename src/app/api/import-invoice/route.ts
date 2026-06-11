// API route: POST /api/import-invoice
// Przyjmuje plik PDF (multipart), zwraca przetworzone dane faktury.
// Używa pdfjs-dist legacy build (Node.js, bez edge runtime).

import { NextRequest, NextResponse } from "next/server";
import { parseInvoicePDF } from "@/lib/invoice";
import { KIEROWCA, TYP_TRANSPORTU } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 30;

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Grupuj elementy po Y (zaokrąglone do całości) — rekonstruuje wiersze tabeli
    const byY = new Map<number, Array<{ x: number; text: string }>>();
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      if (!item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y)!.push({ x: item.transform[4], text: item.str });
    }

    // Sortuj Y malejąco (góra strony = wyższy Y), w każdej grupie sortuj X rosnąco
    const sortedYs = Array.from(byY.keys()).sort((a, b) => b - a);
    for (const y of sortedYs) {
      const items = byY.get(y)!.sort((a, b) => a.x - b.x);
      pageTexts.push(items.map((it) => it.text).join(" "));
    }
  }

  return pageTexts.join("\n");
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe żądanie (brak form-data)" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  console.log("[import-invoice] plik:", {
    name: file?.name,
    size: file?.size,
    type: file?.type,
  });
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "Brak pliku PDF" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Plik musi być w formacie PDF" }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Błąd odczytu pliku" }, { status: 400 });
  }

  const isDev = process.env.NODE_ENV !== "production";

  let pdfText: string;
  try {
    pdfText = await extractTextFromPDF(buffer);
  } catch (err) {
    console.error("[import-invoice] pdfjs error:", err);
    const e = err as Error;
    return NextResponse.json(
      {
        error: "Błąd parsowania PDF — upewnij się, że plik nie jest zaszyfrowany",
        ...(isDev ? { _devMessage: e?.message, _devStack: e?.stack } : {}),
      },
      { status: 422 }
    );
  }

  const result = parseInvoicePDF(pdfText, isDev);

  if (result.ileKolek === 0) {
    return NextResponse.json({
      invoiceNumber: result.invoiceNumber,
      filtered: null,
      message: `W tym PDF nie znaleziono tras dla ${KIEROWCA} (${TYP_TRANSPORTU}).`,
      ...(result._debugText ? { _debug: result._debugText } : {}),
    });
  }

  return NextResponse.json({
    invoiceNumber: result.invoiceNumber,
    filtered: {
      ileKolek: result.ileKolek,
      sumaKm: result.sumaKm,
      netto: result.netto,
      brutto: result.brutto,
      sredniaKm: result.sredniaKm,
      sredniaNetto: result.sredniaNetto,
      sredniaBrutto: result.sredniaBrutto,
      zakresOd: result.zakresOd,
      zakresDo: result.zakresDo,
    },
    ...(result._debugText ? { _debug: result._debugText } : {}),
  });
}
