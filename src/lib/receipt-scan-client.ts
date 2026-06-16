"use client";

import type { VatRate } from "./types";

export interface ReceiptScanResult {
  productLine?: string | null;
  vatLine?: string | null;
  sprzedawca: string | null;
  nip: string | null;
  data: string | null;
  kwotaBrutto: number | null;
  vatRate: VatRate | null;
  nazwa: string | null;
  litry: number | null;
  cenaZaLitr: number | null;
  fuelType?: string | null;
  documentNumber?: string | null;
  confidence?: number;
  needsReview?: boolean;
  _noKey?: boolean;
  _badFormat?: boolean;
  _apiError?: boolean;
  _empty?: boolean;
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

export async function scanReceiptDataUrl(dataUrl: string, fileName = "paragon.jpg"): Promise<ReceiptScanResult> {
  const blob = dataUrlToBlob(dataUrl);
  const form = new FormData();
  form.append("file", blob, fileName.replace(/\.(heic|heif)$/i, ".jpg"));

  const res = await fetch("/api/scan-receipt", {
    method: "POST",
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as ReceiptScanResult & { error?: string };

  if (!res.ok) {
    throw new Error(json.error || "Nie udało się odczytać zdjęcia.");
  }
  return json;
}
