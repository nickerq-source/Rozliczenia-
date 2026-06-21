import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionProfile } from "@/lib/supabase-server";
import { VatRate } from "@/lib/types";
import { getAnthropicApiKey } from "@/lib/anthropic-key";
import { normalizeMileageAi, parseMileageFromText } from "@/lib/mileage-ocr";

export const runtime = "nodejs";
export const maxDuration = 60;

type DocumentType = "receipt" | "odometer" | "tachograph" | "unknown";
type ClaudeImageType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const DOZWOLONE_VAT: VatRate[] = ["0", "0.05", "0.08", "0.23", "zw", "np"];
const MAX_IMAGE_BYTES = 7 * 1024 * 1024;

interface OdczytZdjeciaTankowania {
  documentType: DocumentType;
  productLine: string | null;
  vatLine: string | null;
  sprzedawca: string | null;
  nip: string | null;
  data: string | null; // YYYY-MM-DD
  kwotaBrutto: number | null;
  netAmount: number | null;
  vatAmount: number | null;
  vatRate: VatRate | null;
  nazwa: string | null;
  litry: number | null;
  cenaZaLitr: number | null;
  fuelType: string | null;
  documentNumber: string | null;
  odometerKm: number | null;
  mileageText?: string | null;
  tachoStatus?: string | null;
  speed?: number | null;
  mileageSource?: "manual" | "ocr" | "ai" | "confirmed_ai" | "tachograph";
  confidence: number;
  needsReview: boolean;
  vatNeedsReview?: boolean;
  reviewReasons?: string[];
  _noKey?: boolean;
  _badFormat?: boolean;
  _apiError?: boolean;
  _empty?: boolean;
}

const PUSTY: OdczytZdjeciaTankowania = {
  documentType: "unknown",
  productLine: null,
  vatLine: null,
  sprzedawca: null,
  nip: null,
  data: null,
  kwotaBrutto: null,
  netAmount: null,
  vatAmount: null,
  vatRate: null,
  nazwa: null,
  litry: null,
  cenaZaLitr: null,
  fuelType: null,
  documentNumber: null,
  odometerKm: null,
  confidence: 0,
  needsReview: true,
  vatNeedsReview: true,
};

const PROMPT = `Przeanalizuj zdjęcie i określ, czy jest to paragon/faktura za tankowanie, zdjęcie licznika/przebiegu pojazdu, czy nieznany typ dokumentu.
Zwróć WYŁĄCZNIE czysty JSON, bez markdown:
{
  "documentType": "receipt" | "odometer" | "tachograph" | "unknown",
  "productLine": string | null,
  "vatLine": string | null,
  "liters": number | null,
  "pricePerLiter": number | null,
  "grossAmount": number | null,
  "netAmount": number | null,
  "vatAmount": number | null,
  "date": "YYYY-MM-DD" | null,
  "station": string | null,
  "fuelType": string | null,
  "documentNumber": string | null,
  "nip": string | null,
  "vatRate": number | string | null,
  "odometerKm": number | null,
  "mileage": number | null,
  "mileage_text": string | null,
  "tacho_status": string | null,
  "speed": number | null,
  "confidence": number,
  "needsReview": boolean
}

Rozpoznanie typu:
- receipt: paragon, faktura, dokument tankowania, stacja, NIP, PLN, suma, VAT, netto, brutto, litry, LITR, cena za litr, ON, diesel, paliwo.
- odometer: zdjęcie licznika/deski rozdzielczej z przebiegiem całkowitym pojazdu w km.
- tachograph: zdjęcie tachografu/wyświetlacza Iveco, np. z tekstem "05:34 0 km/h OUT 252020.8 km".
- unknown: jeśli nie jesteś pewien.

Paragon/faktura:
- productLine: przepisz dokładnie linię paliwa, np. "OLEJ NAPEDOWY ... 20.72 LITR*6.29" albo "ON ACR. Pompa #4 20,06L * 6,48".
- liters = liczba bezpośrednio przed L/LITR/l.
- pricePerLiter = liczba bezpośrednio po * / x / ×.
- Nie bierz litrów z tabeli VAT. "Wart.VAT", "Podatek", "Stawka", "Wart.Netto", "Wart.Brutto" to nie litry.
- "SUMA PLN 130.33", "DO ZAPLATY 130.33", "RAZEM 130,33" => grossAmount.
- Szukaj VAT nie tylko przy słowie VAT. Stawka może być jako 8%, 23%, 5%, 0%, VAT 8%, PTU B 8%, Stawka 8%, Kwota B: 08,00%.
- Typowa tabela: netto | VAT % | VAT kwota | brutto albo stawka | netto | podatek | brutto.
- Jeśli widzisz "120.68 | 8% | 9.65 | 130.33", zwróć vatRate=8, netAmount=120.68, vatAmount=9.65, grossAmount=130.33.
- Nie zakładaj VAT 23%, jeśli dokument pokazuje 8% albo inną stawkę.
- Jeśli jest kilka stawek, wybierz tę od pozycji paliwa albo największej/właściwej pozycji tankowania.
- NIP: zwróć NIP sprzedawcy/stacji, nie NIP nabywcy.
- Datę sprzedaży zwróć jako YYYY-MM-DD.
- Przecinek dziesiętny traktuj jak kropkę.

Licznik:
- odczytaj przebieg całkowity pojazdu w km.
- Nie myl przebiegu z trip, temperaturą, godziną, prędkością km/h, spalaniem chwilowym albo zasięgiem.
- Jeśli widzisz np. "05:34 0 km/h OUT 252020.8km", zwróć odometerKm/mileage=252020.8, speed=0, tacho_status="OUT".
- Liczba przed "km/h" to prędkość, nigdy przebieg.
- Godzina typu 05:34 nigdy nie jest przebiegiem.
- Jeśli nie jesteś pewien, documentType="unknown", needsReview=true.

Jeśli pole nie jest widoczne, zwróć null. Nie zgaduj.`;

function empty(type: DocumentType = "unknown"): OdczytZdjeciaTankowania {
  return { ...PUSTY, documentType: type };
}

function toNum(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.,-]/g, "").replace(/\s/g, "");
    const norm = cleaned.replace(/\.(?=.*[.,])/g, "").replace(",", ".");
    const n = parseFloat(norm);
    return isFinite(n) ? n : null;
  }
  return null;
}

const r2 = (n: number | null): number | null => (n != null ? Math.round(n * 100) / 100 : null);
const dodatni = (n: number | null): number | null => (n != null && n > 0 ? n : null);

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
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function normalizeDocumentType(raw: unknown): DocumentType {
  if (raw === "receipt" || raw === "odometer" || raw === "tachograph" || raw === "unknown") return raw;
  return "unknown";
}

function parseFuelFromLine(raw: unknown): { litry: number; cena: number } | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ");
  const match = text.match(/(\d+(?:[,.]\d+)?)\s*(?:LITR|L)\s*[*x×]\s*(\d+(?:[,.]\d+)?)/i);
  if (!match) return null;
  const litry = toNum(match[1]);
  const cena = toNum(match[2]);
  if (litry == null || cena == null || litry <= 0 || cena <= 0 || cena > 15) return null;
  return { litry, cena };
}

function nearestVatRate(rate: number): VatRate | null {
  if (Math.abs(rate - 0.23) < 0.012) return "0.23";
  if (Math.abs(rate - 0.08) < 0.012) return "0.08";
  if (Math.abs(rate - 0.05) < 0.012) return "0.05";
  if (Math.abs(rate) < 0.004) return "0";
  return null;
}

function normalizeVatRate(raw: unknown): VatRate | null {
  if (typeof raw === "string") {
    const value = raw.trim().toLowerCase();
    if (DOZWOLONE_VAT.includes(value as VatRate)) return value as VatRate;
    if (value === "8%" || value === "08%" || value === "08,00%" || value === "8,00%") return "0.08";
    if (value === "23%" || value === "23,00%") return "0.23";
    if (value === "5%" || value === "05%" || value === "05,00%" || value === "5,00%") return "0.05";
    if (value === "0%" || value === "0,00%") return "0";
    const n = toNum(value);
    if (n != null) return normalizeVatRate(n);
  }
  if (typeof raw === "number" && isFinite(raw)) {
    if (raw > 1) return nearestVatRate(raw / 100);
    return nearestVatRate(raw);
  }
  return null;
}

function parseVatFromLine(raw: unknown): VatRate | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ");
  if (/(^|[^\d])23(?:[,.]00)?\s*%/.test(text)) return "0.23";
  if (/(^|[^\d])0?8(?:[,.]00)?\s*%/.test(text)) return "0.08";
  if (/(^|[^\d])0?5(?:[,.]00)?\s*%/.test(text)) return "0.05";

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
        if (net < 5 || vat <= 0 || gross < 5) continue;
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

function vatRateNumber(rate: VatRate | null): number | null {
  if (!rate || rate === "zw" || rate === "np") return null;
  return parseFloat(rate);
}

function validateVatMath(input: {
  gross: number | null;
  net: number | null;
  vat: number | null;
  rate: VatRate | null;
}): { needsReview: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const { gross, net, vat, rate } = input;
  const rateNum = vatRateNumber(rate);
  const tolerance = 0.03;

  if (rateNum == null && (gross != null || net != null || vat != null)) {
    reasons.push("Nie udało się jednoznacznie odczytać stawki VAT.");
  }
  if (gross != null && net != null && vat != null && Math.abs(net + vat - gross) > tolerance) {
    reasons.push("Kwota netto + VAT nie zgadza się z brutto.");
  }
  if (gross != null && net != null && rateNum != null) {
    const expectedNet = Math.round((gross / (1 + rateNum)) * 100) / 100;
    if (Math.abs(expectedNet - net) > tolerance) {
      reasons.push("Netto nie zgadza się matematycznie z brutto i VAT.");
    }
  }
  if (net != null && vat != null && rateNum != null) {
    const expectedVat = Math.round(net * rateNum * 100) / 100;
    if (Math.abs(expectedVat - vat) > tolerance) {
      reasons.push("Kwota VAT nie zgadza się ze stawką VAT.");
    }
  }
  return { needsReview: reasons.length > 0, reasons };
}

function waliduj(raw: unknown): OdczytZdjeciaTankowania {
  if (!raw || typeof raw !== "object") return empty("unknown");
  const o = raw as Record<string, unknown>;
  const documentType = normalizeDocumentType(o.documentType);
  const confidence = clamp01(toNum(o.confidence));
  const baseNeedsReview = typeof o.needsReview === "boolean" ? o.needsReview : true;

  if (documentType === "odometer" || documentType === "tachograph") {
    const aiMileage = normalizeMileageAi(o);
    const textMileage = parseMileageFromText(
      [
        typeof o.mileage_text === "string" ? o.mileage_text : "",
        typeof o.mileageText === "string" ? o.mileageText : "",
        typeof o.rawText === "string" ? o.rawText : "",
        typeof o.text === "string" ? o.text : "",
      ].join(" ")
    );
    const odometerKm = aiMileage.mileage ?? textMileage.mileage;
    const source = documentType === "tachograph" || aiMileage.tachoStatus || textMileage.tachoStatus
      ? "tachograph"
      : "ai";
    return {
      ...empty(documentType),
      odometerKm,
      mileageText: aiMileage.mileageText ?? textMileage.mileageText,
      tachoStatus: aiMileage.tachoStatus ?? textMileage.tachoStatus,
      speed: aiMileage.speed ?? textMileage.speed,
      mileageSource: source,
      confidence: Math.max(confidence, aiMileage.confidence, textMileage.confidence),
      needsReview: baseNeedsReview || Math.max(confidence, aiMileage.confidence, textMileage.confidence) < 0.75 || odometerKm == null,
      reviewReasons: odometerKm == null ? ["Nie udało się pewnie odczytać przebiegu."] : [],
      _empty: odometerKm == null,
    };
  }

  if (documentType === "unknown") {
    return {
      ...empty("unknown"),
      confidence,
      needsReview: true,
      reviewReasons: ["AI nie jest pewne, czy to paragon czy licznik."],
      _empty: true,
    };
  }

  const dataStr = normalizeDate(o.data ?? o.date);
  let gross = dodatni(toNum(o.kwotaBrutto ?? o.grossAmount));
  let net = dodatni(toNum(o.netAmount ?? o.kwotaNetto));
  let vatAmount = dodatni(toNum(o.vatAmount ?? o.kwotaVat ?? o.taxAmount));
  let litry = dodatni(toNum(o.litry ?? o.liters));
  let cena = dodatni(toNum(o.cenaZaLitr ?? o.pricePerLiter));
  const parsedFuel = parseFuelFromLine(o.productLine);
  if (parsedFuel) {
    litry = parsedFuel.litry;
    cena = parsedFuel.cena;
  }

  let suspiciousFuelUnit = cena != null && cena > 15;
  if (suspiciousFuelUnit) {
    litry = null;
    cena = null;
  }

  if (gross == null && litry != null && cena != null) gross = litry * cena;
  else if (cena == null && gross != null && litry != null) cena = gross / litry;
  else if (litry == null && gross != null && cena != null) litry = gross / cena;

  if (cena != null && cena > 15) {
    litry = null;
    cena = null;
    suspiciousFuelUnit = true;
  }

  const vatLine = textOrNull(o.vatLine, 260);
  let vatRate = parseVatFromLine(vatLine) ?? normalizeVatRate(o.vatRate);
  if (!vatRate && net != null && vatAmount != null) vatRate = nearestVatRate(vatAmount / net);
  if (!gross && net != null && vatAmount != null) gross = net + vatAmount;
  if (gross != null && vatRate && net == null) {
    const stawka = vatRateNumber(vatRate);
    if (stawka != null) net = gross / (1 + stawka);
  }
  if (gross != null && net != null && vatAmount == null) vatAmount = gross - net;

  const vatValidation = validateVatMath({ gross, net, vat: vatAmount, rate: vatRate });
  const fuelType = textOrNull(o.fuelType ?? o.nazwa, 60);
  const result: OdczytZdjeciaTankowania = {
    documentType: "receipt",
    productLine: textOrNull(o.productLine, 260),
    vatLine,
    sprzedawca: normalizeStation(textOrNull(o.sprzedawca ?? o.station, 120)),
    nip: typeof o.nip === "string" ? o.nip.replace(/[^0-9]/g, "").slice(0, 15) || null : null,
    data: dataStr,
    kwotaBrutto: r2(gross),
    netAmount: r2(net),
    vatAmount: r2(vatAmount),
    vatRate,
    nazwa: fuelType,
    litry: r2(litry),
    cenaZaLitr: r2(cena),
    fuelType,
    documentNumber: textOrNull(o.documentNumber ?? o.numerDokumentu ?? o.invoiceNumber, 80),
    odometerKm: null,
    confidence,
    needsReview: false,
    vatNeedsReview: vatValidation.needsReview,
    reviewReasons: vatValidation.reasons,
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
      baseNeedsReview ||
      result.confidence < 0.75 ||
      !hasImportant ||
      suspiciousFuelUnit ||
      vatValidation.needsReview,
    _empty: !hasImportant,
    reviewReasons: [
      ...(result.reviewReasons ?? []),
      ...(suspiciousFuelUnit ? ["Cena za litr wygląda podejrzanie."] : []),
      ...(!hasImportant ? ["Nie udało się wyciągnąć kluczowych danych z dokumentu."] : []),
    ],
  };
}

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
  return null;
}

function parseDataUrl(dataUrl: string): { data: string } | null {
  const m = dataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  if (!m) return null;
  return { data: m[1].replace(/\s/g, "") };
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

  const mediaType = wykryjFormat(image.data);
  if (!mediaType) {
    return NextResponse.json(
      {
        ...empty("unknown"),
        _badFormat: true,
        error: "Nie udało się automatycznie rozpoznać danych. Wpisz je ręcznie.",
      }
    );
  }

  const apiKey = getAnthropicApiKey();
  if (!apiKey.key) {
    return NextResponse.json(
      {
        ...empty("unknown"),
        _noKey: true,
        error: "Nie udało się automatycznie rozpoznać danych. Wpisz je ręcznie.",
        reviewReasons: apiKey.error ? [apiKey.error] : undefined,
      }
    );
  }

  try {
    const client = new Anthropic({ apiKey: apiKey.key });
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 600,
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
          ...empty("unknown"),
          _empty: true,
          error: "Nie udało się automatycznie rozpoznać danych. Wpisz je ręcznie.",
        }
      );
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
    let message = apiMsg ?? (e instanceof Error ? e.message : "Nieznany błąd Claude OCR.");
    if (message.includes("ByteString")) {
      message =
        "Niepoprawny znak w danych wysyłanych do Claude. Sprawdź ANTHROPIC_API_KEY w Vercel: ma być sam klucz zaczynający się od sk-ant-, bez opisu i polskich znaków.";
    }
    return NextResponse.json(
      {
        ...empty("unknown"),
        _apiError: true,
        error: "Nie udało się automatycznie rozpoznać danych. Wpisz je ręcznie.",
        reviewReasons: [message],
      }
    );
  }
}
