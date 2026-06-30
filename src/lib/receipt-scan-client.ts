"use client";

import type { VatRate } from "./types";

export interface ReceiptScanResult {
  documentType?: "receipt" | "odometer" | "tachograph" | "unknown";
  productLine?: string | null;
  vatLine?: string | null;
  sprzedawca: string | null;
  nip: string | null;
  data: string | null;
  kwotaBrutto: number | null;
  netAmount?: number | null;
  vatAmount?: number | null;
  vatRate: VatRate | null;
  nazwa: string | null;
  litry: number | null;
  cenaZaLitr: number | null;
  fuelType?: string | null;
  documentNumber?: string | null;
  odometerKm?: number | null;
  mileageText?: string | null;
  tachoStatus?: string | null;
  speed?: number | null;
  mileageSource?: "manual" | "ocr" | "ai" | "confirmed_ai" | "tachograph";
  confidence?: number;
  needsReview?: boolean;
  vatNeedsReview?: boolean;
  reviewReasons?: string[];
  _noKey?: boolean;
  _badFormat?: boolean;
  _apiError?: boolean;
  _empty?: boolean;
  error?: string;
}

export function receiptHasImportantData(o: ReceiptScanResult | null | undefined): boolean {
  return !!(
    o?.data ||
    o?.sprzedawca ||
    o?.nazwa ||
    o?.fuelType ||
    o?.litry != null ||
    o?.cenaZaLitr != null ||
    o?.kwotaBrutto != null
  );
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Nieprawidłowy obraz po kompresji.");

  const mime = match[1] || "image/jpeg";
  const binary = window.atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function scanReceiptDataUrl(
  dataUrl: string,
  fileName = "paragon.jpg",
  hint?: "receipt" | "odometer" | "tachograph"
): Promise<ReceiptScanResult> {
  const blob = dataUrlToBlob(dataUrl);
  const form = new FormData();
  form.append("file", blob, fileName.replace(/\.(heic|heif)$/i, ".jpg"));
  if (hint) form.append("hint", hint);

  const res = await fetch("/api/scan-receipt", {
    method: "POST",
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as ReceiptScanResult & { error?: string };

  if (!res.ok) {
    return {
      documentType: "unknown",
      sprzedawca: null,
      nip: null,
      data: null,
      kwotaBrutto: null,
      vatRate: null,
      nazwa: null,
      litry: null,
      cenaZaLitr: null,
      confidence: 0,
      needsReview: true,
      _apiError: true,
      error: json.error || "Nie udało się automatycznie rozpoznać danych. Wpisz je ręcznie.",
    };
  }
  return json;
}
