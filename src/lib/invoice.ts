// Parsing PDF faktur — pdfjs-dist (Y-grouped lines)

import { KIEROWCA, TYP_TRANSPORTU, VAT } from "./config";

// ─── POMOCNICZE ───────────────────────────────────────────────────────────────

/** Obsługuje zarówno "13659,51" jak i "13659.51". Puste = 0. */
export function parsePolishNumber(s: string | undefined | null): number {
  if (!s || !s.trim()) return 0;
  const normalized = s.trim().replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}

function toISODate(d: Date): string {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

// ─── TYPY ─────────────────────────────────────────────────────────────────────

export interface ParsedRow {
  dataZaladunku: string; // ISO "YYYY-MM-DD"
  odlegloscKm: number;
  kosztPotwierdzony: number; // netto (kolumna Koszt potwierdzony)
}

export interface ParsedInvoice {
  invoiceNumber: string | null;
  ileKolek: number;
  sumaKm: number;
  netto: number;
  brutto: number;
  sredniaKm: number;
  sredniaNetto: number;
  sredniaBrutto: number;
  zakresOd: string | null; // YYYY-MM-DD
  zakresDo: string | null;
  _debugText?: string;
}

// ─── NUMER FAKTURY ────────────────────────────────────────────────────────────

export function extractInvoiceNumber(text: string): string | null {
  const patterns = [
    /\b(58\d{8,12})\b/,
    /Rozliczony\s+(\d{6,15})/i,
    /Numer\s*faktury[:\s]+([A-Z0-9/_-]+)/i,
    /Nr\s*faktury[:\s]+([A-Z0-9/_-]+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

// ─── PARSOWANIE WIERSZA DANYCH ────────────────────────────────────────────────

/**
 * Próg, powyżej którego liczba to na pewno Waga (setki/tysiące kg),
 * a nie Koszt potwierdzony (kwota za kółko, zwykle setki zł).
 */
const WAGA_THRESHOLD = 2000;

/**
 * Struktura rzeczywistego wiersza (z pdfjs-dist, Y-grouped):
 *   10182/06/26CLKR2 KRAKÓW, YEVHENII 4/10 2026-06-06 44 6,0 3723,95 351,37 0,00 350,08 ...
 *
 * Liczby po dacie YYYY-MM-DD, w kolejności:
 *   [0] Odległość km        np. 44
 *   [1] Ilość msc paletowych np. 6,0
 *   [2] Waga                np. 3723,95   ← NIE jest kwotą
 *   [3] Koszt potwierdzony  np. 351,37    ← TEGO chcemy (netto)
 *   [4] Koszt linia         np. 0,00
 *   [5] Koszt dystrybucja   np. 350,08    ← sanity check (≈ Koszt potwierdzony)
 *   [6] Koszt viatol …      drobnica
 *
 * Koszt potwierdzony = pierwsza niezerowa liczba PO Wadze (indeks ≥ 3).
 */
function parseDataLine(
  line: string,
  firstNamePart: string
): ParsedRow | null {
  const lineLower = line.toLowerCase();
  if (!lineLower.includes(firstNamePart.toLowerCase())) return null;
  if (!lineLower.includes(TYP_TRANSPORTU.toLowerCase())) return null;

  const dateMatch = line.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (!dateMatch) return null;

  const afterDate = line.slice(dateMatch.index! + dateMatch[1].length);

  // Wyciągnij liczby po dacie (liczby całkowite lub dziesiętne z przecinkiem/kropką)
  const numRegex = /\b(\d{1,6}(?:[,\.]\d{1,4})?)\b/g;
  const nums: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = numRegex.exec(afterDate)) !== null) {
    nums.push(parsePolishNumber(m[1]));
  }

  // Potrzebujemy: km(0), palety(1), waga(2), koszt_potwierdzony(≥3)
  if (nums.length < 4) return null;

  const km = nums[0];
  const waga = nums[2];

  // Koszt potwierdzony = pierwsza niezerowa liczba od indeksu 3
  let kosztIdx = 3;
  while (kosztIdx < nums.length && nums[kosztIdx] === 0) kosztIdx++;
  if (kosztIdx >= nums.length) return null;
  const kosztPotwierdzony = nums[kosztIdx];

  // Sanity 1: koszt w tysiącach == prawdopodobnie wzięliśmy Wagę → odrzuć
  if (kosztPotwierdzony >= WAGA_THRESHOLD || kosztPotwierdzony === waga) {
    return null;
  }

  // Sanity 2: Koszt dystrybucja (kolejna niezerowa) ≈ Koszt potwierdzony
  let dystIdx = kosztIdx + 1;
  while (dystIdx < nums.length && nums[dystIdx] === 0) dystIdx++;
  if (dystIdx < nums.length) {
    const kosztDystrybucja = nums[dystIdx];
    if (Math.abs(kosztDystrybucja - kosztPotwierdzony) > 50) {
      // Kolumny się nie zgadzają — nie ufamy temu wierszowi
      return null;
    }
  }

  if (km === 0 || kosztPotwierdzony === 0) return null;

  return {
    dataZaladunku: dateMatch[1],
    odlegloscKm: km,
    kosztPotwierdzony,
  };
}

// ─── GŁÓWNA FUNKCJA ───────────────────────────────────────────────────────────

/** Parsuje surowy tekst (z pdfjs-dist) i zwraca obliczone wyniki. */
export function parseInvoicePDF(
  rawText: string,
  debugMode = false
): ParsedInvoice {
  const invoiceNumber = extractInvoiceNumber(rawText);

  const parts = KIEROWCA.trim().split(/\s+/);
  const firstName = parts[0] ?? KIEROWCA;
  const lastName = parts[1] ?? "";

  const lines = rawText
    .split("\n")
    .map((l) => l.replace(/\t/g, " ").replace(/\s{2,}/g, " ").trim())
    .filter((l) => l.length > 0);

  const rows: ParsedRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const row = parseDataLine(lines[i], firstName);
    if (!row) continue;

    // Weryfikacja: następna linia powinna zawierać nazwisko kierowcy
    if (lastName) {
      const next = lines[i + 1] ?? "";
      if (!next.toLowerCase().includes(lastName.toLowerCase())) continue;
    }

    rows.push(row);
  }

  return buildResult(invoiceNumber, rows, debugMode ? rawText : undefined);
}

// ─── OBLICZENIA SUMARYCZNE ────────────────────────────────────────────────────

export function buildResult(
  invoiceNumber: string | null,
  rows: ParsedRow[],
  debugText?: string
): ParsedInvoice {
  const ileKolek = rows.length;
  const sumaKm = rows.reduce((s, r) => s + r.odlegloscKm, 0);

  const nettoRaw = rows.reduce((s, r) => s + r.kosztPotwierdzony, 0);
  const netto = Math.round(nettoRaw * 100) / 100;
  const brutto = Math.round(netto * (1 + VAT) * 100) / 100;

  const sredniaKm =
    ileKolek > 0 ? Math.round((sumaKm / ileKolek) * 100) / 100 : 0;
  const sredniaNetto =
    ileKolek > 0 ? Math.round((netto / ileKolek) * 100) / 100 : 0;
  const sredniaBrutto =
    ileKolek > 0 ? Math.round((brutto / ileKolek) * 100) / 100 : 0;

  const dates = rows
    .map((r) => {
      const d = new Date(r.dataZaladunku + "T12:00:00");
      return isNaN(d.getTime()) ? null : d;
    })
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    invoiceNumber,
    ileKolek,
    sumaKm,
    netto,
    brutto,
    sredniaKm,
    sredniaNetto,
    sredniaBrutto,
    zakresOd: dates.length > 0 ? toISODate(dates[0]) : null,
    zakresDo: dates.length > 0 ? toISODate(dates[dates.length - 1]) : null,
    ...(debugText !== undefined ? { _debugText: debugText.slice(0, 3000) } : {}),
  };
}
