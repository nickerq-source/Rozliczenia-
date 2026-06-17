// API route: POST /api/import-invoice
// Przyjmuje plik PDF (multipart), zwraca przetworzone dane faktury.
// Używa pdfjs-dist legacy build (Node.js, bez edge runtime).

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { parseInvoicePDF, type InvoiceRecordOverride, type InvoiceVehicleAssignmentRule } from "@/lib/invoice";
import { KIEROWCA, TYP_TRANSPORTU } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 30;

function sourceRowsFromResult(result: ReturnType<typeof parseInvoicePDF>) {
  return result.allRows.map((row) => ({
    orderNumber: row.orderNumber,
    date: row.loadingDate,
    driverName: row.driverName,
    vehicleType: row.vehicleType,
    route: row.route,
    km: row.distanceKm,
    cost: row.confirmedCost,
    notes: row.notes,
    status: row.status,
    invitationId: row.invitationId,
    vehicleOwner: row.vehicleOwner,
    vehiclePlate: null,
    vehicleRuleReason: undefined,
    manuallyOverridden: false,
    isAdditional: !!row.notes.trim() || /\/I\b/i.test(row.rawText),
    reason: "rekord źródłowy",
  }));
}

function parseJsonArrayField<T>(formData: FormData, name: string): T[] {
  const raw = formData.get(name);
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

// Katalogi danych pdfjs (czcionki standardowe + cmapy CID). Bez nich parser
// potrafi paść na fakturach z osadzonymi czcionkami CID.
// UWAGA: NIE używać require.resolve — w bundlu webpacka zwraca numeryczne ID
// modułu (np. 15754), nie ścieżkę → path.dirname rzuca błąd na Vercel.
// Ścieżkę budujemy z process.cwd(); katalogi wdraża outputFileTracingIncludes.
function pdfjsDataDirs(): { standardFontDataUrl?: string; cMapUrl?: string } {
  const root = path.join(process.cwd(), "node_modules", "pdfjs-dist");
  const standardFontDataUrl = path.join(root, "standard_fonts") + path.sep;
  const cMapUrl = path.join(root, "cmaps") + path.sep;
  if (fs.existsSync(standardFontDataUrl) && fs.existsSync(cMapUrl)) {
    return { standardFontDataUrl, cMapUrl };
  }
  // Brak katalogów — pdfjs tylko ostrzeże; ekstrakcja tekstu i tak zadziała
  return {};
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

  // Wskaż pdfjs plik workera bezwzględną ścieżką — na Vercel relatywne
  // require("./pdf.worker.js") zawodzi (worker nie leży obok pdf.js w bundlu).
  const workerPath = path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "legacy",
    "build",
    "pdf.worker.js"
  );
  if (fs.existsSync(workerPath)) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
  }

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    ...pdfjsDataDirs(), // standardFontDataUrl/cMapUrl gdy katalogi dostępne
    cMapPacked: true,
    useSystemFonts: false, // nie próbuj sięgać po czcionki systemowe (brak na serverless)
    disableFontFace: true, // ekstrakcja tekstu nie potrzebuje renderu czcionek
    isEvalSupported: false,
    verbosity: 0, // wycisz ostrzeżenia DOMMatrix/fontów
  });
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
        // Krótki powód widoczny też na produkcji (wewnętrzna apka) — ułatwia diagnozę
        _reason: e?.message ?? "nieznany błąd",
        ...(isDev ? { _devStack: e?.stack } : {}),
      },
      { status: 422 }
    );
  }

  const driverName = String(formData.get("driverName") ?? KIEROWCA).trim() || KIEROWCA;
  const vehicleType = String(formData.get("vehicleType") ?? TYP_TRANSPORTU).trim() || TYP_TRANSPORTU;
  const dateFromRaw = String(formData.get("dateFrom") ?? "").trim();
  const dateToRaw = String(formData.get("dateTo") ?? "").trim();
  const settlementVehiclePlate = String(formData.get("settlementVehiclePlate") ?? "").trim();
  const settlementVehicleModeRaw = String(formData.get("settlementVehicleMode") ?? "none").trim();
  const vehicleAssignmentRules = parseJsonArrayField<InvoiceVehicleAssignmentRule>(formData, "vehicleAssignmentRules");
  const recordOverrides = parseJsonArrayField<InvoiceRecordOverride>(formData, "recordOverrides");

  const result = parseInvoicePDF(pdfText, isDev, {
    driverName,
    vehicleType,
    dateFrom: dateFromRaw || null,
    dateTo: dateToRaw || null,
    settlementVehiclePlate: settlementVehiclePlate || null,
    settlementVehicleMode: settlementVehicleModeRaw === "plate" ? "plate" : "none",
    vehicleAssignmentRules,
    recordOverrides,
  });

  const filtered = {
    filters: result.filters,
    ileKolek: result.ileKolek,
    ileZlecen: result.ileZlecen,
    sumaKm: result.sumaKm,
    netto: result.netto,
    brutto: result.brutto,
    sredniaKm: result.sredniaKm,
    sredniaNetto: result.sredniaNetto,
    sredniaBrutto: result.sredniaBrutto,
    zakresOd: result.zakresOd,
    zakresDo: result.zakresDo,
    includedRows: result.includedRows,
    rejectedRows: result.rejectedRows,
    sourceRows: sourceRowsFromResult(result),
  };

  if (result.allRows.length === 0) {
    return NextResponse.json({
      invoiceNumber: result.invoiceNumber,
      filtered: null,
      message: "Nie udało się odczytać żadnych pozycji z tabeli faktury.",
      ...(result._debugText ? { _debug: result._debugText } : {}),
    });
  }

  return NextResponse.json({
    invoiceNumber: result.invoiceNumber,
    filtered,
    message:
      result.ileKolek === 0 && result.ileZlecen === 0
        ? `W tym PDF nie znaleziono tras dla ${driverName} (${vehicleType}) w wybranym zakresie.`
        : undefined,
    ...(result._debugText ? { _debug: result._debugText } : {}),
  });
}
