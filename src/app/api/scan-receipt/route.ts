import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionProfile } from "@/lib/supabase-server";
import { VatRate } from "@/lib/types";
import { getAnthropicApiKey } from "@/lib/anthropic-key";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * OCR paragonu/faktury ze zdjęcia (część B). Dla admina (koszty) i kierowcy
 * (tankowanie). Przyjmuje obraz (base64 dataUrl), pyta Claude o dane, zwraca
 * JSON do modala. AI nigdy nie zapisuje kosztu — to robi użytkownik po
 * sprawdzeniu (admin bezpośrednio, kierowca przez /api/driver/fuel).
 * ANTHROPIC_API_KEY wyłącznie server-side.
 */

const DOZWOLONE_VAT: VatRate[] = ["0", "0.05", "0.08", "0.23", "zw", "np"];

interface OdczytParagonu {
  productLine: string | null;
  vatLine: string | null;
  sprzedawca: string | null;
  nip: string | null;
  data: string | null; // YYYY-MM-DD
  kwotaBrutto: number | null;
  vatRate: VatRate | null;
  nazwa: string | null;
  litry: number | null; // liczba litrów paliwa (gdy to paragon za paliwo)
  cenaZaLitr: number | null; // cena za 1 litr
  fuelType: string | null;
  documentNumber: string | null;
  confidence: number;
  needsReview: boolean;
  _noKey?: boolean;
  _badFormat?: boolean;
  _apiError?: boolean;
  _empty?: boolean;
}

const PUSTY: OdczytParagonu = {
  productLine: null,
  vatLine: null,
  sprzedawca: null,
  nip: null,
  data: null,
  kwotaBrutto: null,
  vatRate: null,
  nazwa: null,
  litry: null,
  cenaZaLitr: null,
  fuelType: null,
  documentNumber: null,
  confidence: 0,
  needsReview: true,
};

const PROMPT = `Read data from a Polish fuel receipt or invoice. Return ONLY raw JSON, with no markdown and no extra text:
{
  "productLine": string | null,
  "vatLine": string | null,
  "liters": number | null,
  "pricePerLiter": number | null,
  "grossAmount": number | null,
  "date": "YYYY-MM-DD" | null,
  "station": string | null,
  "fuelType": string | null,
  "documentNumber": string | null,
  "nip": string | null,
  "vatRate": "0" | "0.05" | "0.08" | "0.23" | "zw" | "np" | null,
  "confidence": number,
  "needsReview": boolean
}

How to read Polish fuel receipts:
- If the image is sideways, read it after mentally rotating it.
- productLine: copy exactly one fuel product line, the line with LITR/L/l and * or x, for example "OLEJ NAPEDOWY ... 20.72 LITR*6.29" or "EFECTA DIESEL ... 85,44 l*7,23".
- Read liters and price per liter ONLY from productLine: liters = number directly BEFORE LITR/L/l, pricePerLiter = number directly AFTER * or x.
- A line like "86.10 LITR*6.29", "20.72 LITR * 6.29", "20,06L x 6,48" or "85,44 l*7,23" means liters = 86.10 / 20.72 / 20.06 / 85.44 and pricePerLiter = 6.29 / 6.48 / 7.23.
- Do NOT take liters or price per liter from the VAT/tax table. Columns "Wart.VAT", "Podatek", "Stawka", "Wart.Netto", "Wart.Brutto" are not liters and not price per liter.
- A number next to "Wart.VAT" or "Podatek" (for example 40.12) is VAT amount, not liters.
- "SUMA: PLN 130.33", "DO ZAPLATY 130.33", "RAZEM 130,33" means grossAmount = 130.33.
- "Data sprzedazy: 06-06-2026" means fuel date -> return "2026-06-06".
- "STACJA PALIW MOYA" -> station = "MOYA".
- "OLEJ NAPEDOWY" / "ON" -> fuelType = "Olej napedowy"; "Pb95"/"Pb98" -> gasoline.
- vatLine: copy the VAT rate line/table, for example "Stawka 8%" or "Kwota B: 08,00%".
- Read VAT ONLY from the visible rate on the document: 8% or 08,00% => "0.08", 23% or 23,00% => "0.23". Do not guess VAT from fuel type.
- NIP: return seller/station NIP, not buyer NIP. Look near "Sprzedawca", station header or station company details. Ignore "Nabywca" and "NIP Nabywcy".
- Treat comma decimal as dot decimal (20,72 = 20.72; 130,33 = 130.33).
Return numbers as numbers, not strings. If a field is not visible, return null. Do not guess.`;

/** Tolerancyjna konwersja na liczbę: liczba albo tekst "20,72"/"PLN 130.33"/"6.29 zł". */
function toNum(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.,-]/g, "").replace(/\s/g, "");
    // ostatni separator decyduje o kropce dziesiętnej
    const norm = cleaned.replace(/\.(?=.*[.,])/g, "").replace(",", ".");
    const n = parseFloat(norm);
    return isFinite(n) ? n : null;
  }
  return null;
}

type ClaudeImageType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;

/**
 * Prawdziwy format obrazu z magic bytes (nie z prefiksu dataUrl/rozszerzenia).
 * Kluczowe: Claude odrzuca obraz, gdy media_type nie zgadza się z bajtami
 * (np. iPhone HEIC, plik PNG nazwany .jpg) → 400 i „nie udało się odczytać".
 */
function wykryjFormat(base64: string): ClaudeImageType | null {
  let head: Buffer;
  try {
    head = Buffer.from(base64.slice(0, 32), "base64");
  } catch {
    return null;
  }
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png";
  if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return "image/gif";
  if (
    head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
  ) return "image/webp";
  return null; // np. HEIC/HEIF — Claude nie obsługuje
}

/** Wyciąga czyste base64 z dataUrl (media_type i tak wykrywamy z bajtów) */
function parseDataUrl(dataUrl: string): { data: string } | null {
  const m = dataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  if (!m) return null;
  // usuń ewentualne białe znaki z base64
  return { data: m[1].replace(/\s/g, "") };
}

function clamp01(n: number | null): number {
  if (n == null || !isFinite(n)) return 0;
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

function textOrNull(v: unknown, max = 120): string | null {
  return typeof v === "string" ? v.trim().slice(0, max) || null : null;
}

function normalizeDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const pl = value.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (!pl) return null;
  const [, dd, mm, yyyy] = pl;
  return `${yyyy}-${dd.padStart(2, "0")}-${mm.padStart(2, "0")}`;
}

function parseFuelFromLine(raw: unknown): { litry: number; cena: number } | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ");
  const match = text.match(/(\d+(?:[,.]\d+)?)\s*(?:LITR|L)\s*[*x×]\s*(\d+(?:[,.]\d+)?)/i);
  if (!match) return null;
  const litry = toNum(match[1]);
  const cena = toNum(match[2]);
  if (litry == null || cena == null || litry <= 0 || cena <= 0 || cena > 12) return null;
  return { litry, cena };
}

function nearestVatRate(rate: number): VatRate | null {
  if (Math.abs(rate - 0.23) < 0.012) return "0.23";
  if (Math.abs(rate - 0.08) < 0.012) return "0.08";
  if (Math.abs(rate - 0.05) < 0.012) return "0.05";
  if (Math.abs(rate) < 0.004) return "0";
  return null;
}

function parseVatFromLine(raw: unknown): VatRate | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ");
  if (/(^|[^\d])23(?:[,.]00)?\s*%/.test(text)) return "0.23";
  if (/(^|[^\d])0?8(?:[,.]00)?\s*%/.test(text)) return "0.08";
  if (/(^|[^\d])0?5(?:[,.]00)?\s*%/.test(text)) return "0.05";
  if (/(^|[^\d])0(?:[,.]00)?\s*%/.test(text)) {
    // Nie kończymy od razu: czasem AI myli "8%" jako "0%", ale obok są
    // netto/VAT/brutto i z nich da się odzyskać stawkę.
  }

  const nums = [...text.matchAll(/\d+(?:[,.]\d+)?/g)]
    .map((m) => toNum(m[0]))
    .filter((n): n is number => n != null);

  for (let i = 0; i < nums.length; i += 1) {
    for (let j = 0; j < nums.length; j += 1) {
      for (let k = 0; k < nums.length; k += 1) {
        if (i === j || i === k || j === k) continue;
        const net = nums[i];
        const vat = nums[j];
        const gross = nums[k];
        if (net < 10 || vat <= 0 || gross < 10) continue;
        if (Math.abs(net + vat - gross) > 0.08) continue;
        const rate = nearestVatRate(vat / net);
        if (rate) return rate;
      }
    }
  }

  if (/(^|[^\d])0(?:[,.]00)?\s*%/.test(text)) return "0";
  return null;
}

function normalizeStation(value: string | null): string | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (upper.includes("MOYA")) return "MOYA";
  if (upper.includes("ORLEN")) return "ORLEN";
  if (upper.includes("BP")) return "BP";
  if (upper.includes("SHELL")) return "Shell";
  return value;
}

function walidujVat(raw: unknown): VatRate | null {
  if (typeof raw === "string" && DOZWOLONE_VAT.includes(raw as VatRate)) return raw as VatRate;
  if (typeof raw === "number") {
    const s = String(raw);
    if (DOZWOLONE_VAT.includes(s as VatRate)) return s as VatRate;
  }
  return null;
}

const r2 = (n: number | null): number | null => (n != null ? Math.round(n * 100) / 100 : null);
const dodatni = (n: number | null): number | null => (n != null && n > 0 ? n : null);

function waliduj(raw: unknown): OdczytParagonu {
  if (!raw || typeof raw !== "object") return PUSTY;
  const o = raw as Record<string, unknown>;
  const dataStr = normalizeDate(o.data ?? o.date);

  let kwota = dodatni(toNum(o.kwotaBrutto ?? o.grossAmount));
  let litry = dodatni(toNum(o.litry ?? o.liters));
  let cena = dodatni(toNum(o.cenaZaLitr ?? o.pricePerLiter));
  const parsedFuel = parseFuelFromLine(o.productLine);
  if (parsedFuel) {
    litry = parsedFuel.litry;
    cena = parsedFuel.cena;
  }

  // Jeżeli AI pomyli kwotę VAT/podatku z litrami, często wychodzi absurdalna
  // cena za litr (np. 541,57 / 40,12 = 13,50). Lepiej zostawić pola puste
  // do ręcznej weryfikacji niż zapisać błędne litry.
  let suspiciousFuelUnit = cena != null && cena > 12;
  if (suspiciousFuelUnit) {
    litry = null;
    cena = null;
  }

  // Awaryjne wyliczenie brakującego pola z dwóch pozostałych
  if (kwota == null && litry != null && cena != null) kwota = litry * cena;
  else if (cena == null && kwota != null && litry != null) cena = kwota / litry;
  else if (litry == null && kwota != null && cena != null) litry = kwota / cena;

  if (cena != null && cena > 12) {
    litry = null;
    cena = null;
    suspiciousFuelUnit = true;
  }

  const fuelType = textOrNull(o.fuelType ?? o.nazwa, 60);
  const vatLine = textOrNull(o.vatLine, 220);
  const parsedVat = parseVatFromLine(vatLine);
  const rawVat = walidujVat(o.vatRate);
  const vatRate =
    parsedVat ??
    (rawVat === "0.23" && !/(^|[^\d])23(?:[,.]00)?\s*%/.test(vatLine ?? "")
      ? null
      : rawVat);
  const result = {
    productLine: textOrNull(o.productLine, 220),
    vatLine,
    sprzedawca: normalizeStation(textOrNull(o.sprzedawca ?? o.station, 120)),
    nip: typeof o.nip === "string" ? o.nip.replace(/[^0-9]/g, "").slice(0, 15) || null : null,
    data: dataStr,
    kwotaBrutto: r2(kwota),
    vatRate,
    nazwa: fuelType,
    litry: r2(litry),
    cenaZaLitr: r2(cena),
    fuelType,
    documentNumber: textOrNull(o.documentNumber ?? o.numerDokumentu ?? o.invoiceNumber, 80),
    confidence: clamp01(toNum(o.confidence)),
    needsReview: typeof o.needsReview === "boolean" ? o.needsReview : true,
  };

  const hasImportant =
    !!result.data ||
    !!result.sprzedawca ||
    !!result.nazwa ||
    result.kwotaBrutto != null ||
    result.litry != null ||
    result.cenaZaLitr != null;

  return {
    ...result,
    needsReview:
      result.needsReview ||
      result.confidence < 0.8 ||
      !hasImportant ||
      suspiciousFuelUnit ||
      (rawVat === "0.23" && result.vatRate == null),
    _empty: !hasImportant,
  };
}

async function readImageFromRequest(req: NextRequest): Promise<{
  data: string;
  fileName?: string;
  fileType?: string;
  fileSize: number;
}> {
  const contentType = req.headers.get("content-type") ?? "";
  const dev = process.env.NODE_ENV !== "production";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Brak pliku w formularzu.");
    if (file.size <= 0) throw new Error("Plik jest pusty.");
    if (file.size > MAX_IMAGE_BYTES) throw new Error("Zdjęcie jest za duże po kompresji.");

    const buffer = Buffer.from(await file.arrayBuffer());
    if (dev) {
      console.log("[scan-receipt] file", {
        name: file.name,
        type: file.type,
        size: file.size,
      });
    }

    return {
      data: buffer.toString("base64"),
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    };
  }

  let body: { image?: string };
  try {
    body = await req.json();
  } catch {
    throw new Error("Nieprawidłowy JSON.");
  }

  const parsed = body.image ? parseDataUrl(body.image) : null;
  if (!parsed) throw new Error("Brak prawidłowego obrazu.");
  const bytes = Math.ceil((parsed.data.length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) throw new Error("Zdjęcie jest za duże po kompresji.");
  if (dev) console.log("[scan-receipt] dataUrl", { bytes });

  return {
    data: parsed.data,
    fileSize: bytes,
  };
}

export async function POST(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "admin" && profile.role !== "driver") {
    return NextResponse.json({ error: "Brak dostępu" }, { status: 403 });
  }

  let image: { data: string; fileName?: string; fileType?: string; fileSize: number };
  try {
    image = await readImageFromRequest(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się odczytać obrazu.";
    if (process.env.NODE_ENV !== "production") console.log("[scan-receipt] request error:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Prawdziwy format z bajtów — Claude odrzuca obraz przy niezgodnym media_type
  const mediaType = wykryjFormat(image.data);
  if (!mediaType) {
    // np. HEIC/HEIF z iPhone'a, którego przeglądarka nie przekonwertowała
    return NextResponse.json(
      {
        ...PUSTY,
        _badFormat: true,
        error: "Nieobsługiwany format zdjęcia. Użyj JPG, PNG albo WebP.",
      },
      { status: 415 }
    );
  }

  const apiKey = getAnthropicApiKey();
  if (!apiKey.key) {
    return NextResponse.json(
      {
        ...PUSTY,
        _noKey: true,
        error: apiKey.error,
      },
      { status: 503 }
    );
  }

  try {
    const client = new Anthropic({ apiKey: apiKey.key });
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: image.data,
              },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      if (process.env.NODE_ENV !== "production") console.log("[scan-receipt] brak JSON w odpowiedzi:", text.slice(0, 300));
      return NextResponse.json(
        {
          ...PUSTY,
          _empty: true,
          error: "Claude nie zwrócił poprawnego JSON ze zdjęcia. Spróbuj wyraźniejsze zdjęcie.",
        },
        { status: 422 }
      );
    }
    const wynik = waliduj(JSON.parse(match[0]));
    if (wynik._empty) {
      return NextResponse.json(
        {
          ...wynik,
          error: "Nie udało się wyciągnąć danych z tego zdjęcia. Spróbuj zrobić zdjęcie bliżej, prosto i przy lepszym świetle.",
        },
        { status: 422 }
      );
    }
    if (process.env.NODE_ENV !== "production") {
      console.log("[scan-receipt] odczyt:", JSON.stringify({
        ...wynik,
        fileName: image.fileName,
        fileType: image.fileType,
        fileSize: image.fileSize,
      }));
    }
    return NextResponse.json(wynik);
  } catch (e) {
    const status = (e as { status?: number })?.status;
    const apiMsg = (e as { error?: { error?: { message?: string } } })?.error?.error?.message;
    console.error("[scan-receipt] AI error:", status ?? "", apiMsg ?? (e instanceof Error ? e.message : e));
    let message = apiMsg ?? (e instanceof Error ? e.message : "Nieznany błąd Claude OCR.");
    if (message.includes("ByteString")) {
      message =
        "Niepoprawny znak w danych wysyłanych do Claude. Sprawdź ANTHROPIC_API_KEY w Vercel: ma być sam klucz zaczynający się od sk-ant-, bez opisu i polskich znaków.";
    }
    return NextResponse.json(
      {
        ...PUSTY,
        _apiError: true,
        error: `Błąd Claude OCR: ${message}`,
      },
      { status: 502 }
    );
  }
}
