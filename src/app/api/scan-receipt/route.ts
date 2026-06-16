import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionProfile } from "@/lib/supabase-server";
import { VatRate } from "@/lib/types";

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

const PROMPT = `Odczytaj dane z faktury lub paragonu za tankowanie. Zwróć WYŁĄCZNIE czysty JSON (bez markdown, bez komentarzy, bez tekstu wokół):
{
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

Jak czytać polskie faktury za paliwo:
- Litry i cenę za litr bierz WYŁĄCZNIE z linii produktu, gdzie występuje LITR/L oraz znak * albo x.
- Linia typu "86.10 LITR*6.29", "20.72 LITR * 6.29" lub "20,72 L x 6,29" znaczy: litry = 86.10 / 20.72, cenaZaLitr = 6.29.
- NIE bierz litrów ani ceny za litr z tabeli VAT/podatku. Kolumny "Wart.VAT", "Podatek", "Stawka", "Wart.Netto", "Wart.Brutto" nie są litrami ani ceną za litr.
- Liczba przy "Wart.VAT" albo "Podatek" (np. 40.12) to kwota VAT, nie litry.
- "SUMA: PLN 130.33", "DO ZAPŁATY 130.33", "RAZEM 130,33" znaczy: kwotaBrutto = 130.33.
- "Data sprzedaży: 06-06-2026" znaczy datę tankowania → zwróć "2026-06-06".
- "STACJA PALIW MOYA" → sprzedawca = "MOYA".
- "OLEJ NAPĘDOWY" / "ON" → nazwa "Olej napędowy"; "Pb95"/"Pb98" → benzyna.
- VAT czytaj z widocznej stawki na dokumencie, np. 8% => "0.08", 23% => "0.23". Nie zgaduj VAT po typie paliwa.
- Liczby z przecinkiem traktuj jak z kropką (20,72 = 20.72; 130,33 = 130.33).
Liczby zwróć jako liczby (nie tekst). Jeżeli czegoś nie widzisz, zwróć null, nie zgaduj.`;

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
  const result = {
    sprzedawca: textOrNull(o.sprzedawca ?? o.station, 120),
    nip: typeof o.nip === "string" ? o.nip.replace(/[^0-9]/g, "").slice(0, 15) || null : null,
    data: dataStr,
    kwotaBrutto: r2(kwota),
    vatRate: walidujVat(o.vatRate),
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
    needsReview: result.needsReview || result.confidence < 0.8 || !hasImportant || suspiciousFuelUnit,
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
    return NextResponse.json({ ...PUSTY, _badFormat: true }, { status: 415 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Brak klucza → puste pola do ręcznego wpisania (bez crasha)
    return NextResponse.json({ ...PUSTY, _noKey: true });
  }

  try {
    const client = new Anthropic({ apiKey });
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
      return NextResponse.json({ ...PUSTY, _empty: true });
    }
    const wynik = waliduj(JSON.parse(match[0]));
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
    // Nie crashuj — zostaw użytkownikowi puste pola (z flagą błędu)
    return NextResponse.json({ ...PUSTY, _apiError: true });
  }
}
