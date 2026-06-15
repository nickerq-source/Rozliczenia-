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
}

const PUSTY: OdczytParagonu = {
  sprzedawca: null, nip: null, data: null, kwotaBrutto: null, vatRate: null, nazwa: null, litry: null, cenaZaLitr: null,
};

const PROMPT = `Odczytaj dane z tego zdjęcia paragonu lub faktury za TANKOWANIE PALIWA. Zwróć WYŁĄCZNIE czysty JSON (bez markdown, bez komentarzy, bez tekstu wokół):
{"sprzedawca": "krótka nazwa stacji (np. MOYA, Orlen, BP, Shell) lub null",
 "nip": "NIP sprzedawcy cyframi bez kresek lub null",
 "data": "data sprzedaży w formacie YYYY-MM-DD lub null",
 "kwotaBrutto": liczba — suma brutto do zapłaty (np. 130.33) lub null,
 "litry": liczba litrów paliwa (np. 20.72) lub null,
 "cenaZaLitr": cena za 1 litr (np. 6.29) lub null,
 "vatRate": jedna z "0","0.05","0.08","0.23","zw","np" lub null,
 "nazwa": "krótka nazwa, np. 'Olej napędowy', 'Pb95' lub null"}

Jak czytać polskie faktury za paliwo:
- Linia typu "20.72 LITR * 6.29" lub "20,72 L x 6,29" znaczy: litry = 20.72, cenaZaLitr = 6.29.
- "SUMA: PLN 130.33", "DO ZAPŁATY 130.33", "RAZEM 130,33" znaczy: kwotaBrutto = 130.33.
- "Data sprzedaży: 06-06-2026" znaczy datę tankowania → zwróć "2026-06-06".
- "STACJA PALIW MOYA" → sprzedawca = "MOYA".
- "OLEJ NAPĘDOWY" / "ON" → nazwa "Olej napędowy"; "Pb95"/"Pb98" → benzyna.
- Liczby z przecinkiem traktuj jak z kropką (20,72 = 20.72; 130,33 = 130.33).
Liczby zwróć jako liczby (nie tekst). Jeśli czegoś naprawdę nie ma na zdjęciu — wpisz null. Nie zgaduj.`;

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
  const dataStr = typeof o.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.data) ? o.data : null;

  let kwota = dodatni(toNum(o.kwotaBrutto));
  let litry = dodatni(toNum(o.litry));
  let cena = dodatni(toNum(o.cenaZaLitr));

  // Awaryjne wyliczenie brakującego pola z dwóch pozostałych
  if (kwota == null && litry != null && cena != null) kwota = litry * cena;
  else if (cena == null && kwota != null && litry != null) cena = kwota / litry;
  else if (litry == null && kwota != null && cena != null) litry = kwota / cena;

  return {
    sprzedawca: typeof o.sprzedawca === "string" ? o.sprzedawca.trim().slice(0, 120) || null : null,
    nip: typeof o.nip === "string" ? o.nip.replace(/[^0-9]/g, "").slice(0, 15) || null : null,
    data: dataStr,
    kwotaBrutto: r2(kwota),
    vatRate: walidujVat(o.vatRate),
    nazwa: typeof o.nazwa === "string" ? o.nazwa.trim().slice(0, 60) || null : null,
    litry: r2(litry),
    cenaZaLitr: r2(cena),
  };
}

export async function POST(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "admin" && profile.role !== "driver") {
    return NextResponse.json({ error: "Brak dostępu" }, { status: 403 });
  }

  let body: { image?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy JSON" }, { status: 400 });
  }

  const parsed = body.image ? parseDataUrl(body.image) : null;
  if (!parsed) {
    return NextResponse.json({ error: "Brak prawidłowego obrazu" }, { status: 400 });
  }

  // Prawdziwy format z bajtów — Claude odrzuca obraz przy niezgodnym media_type
  const mediaType = wykryjFormat(parsed.data);
  if (!mediaType) {
    // np. HEIC/HEIF z iPhone'a, którego przeglądarka nie przekonwertowała
    return NextResponse.json({ ...PUSTY, _badFormat: true });
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
                data: parsed.data,
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
      return NextResponse.json(PUSTY);
    }
    const wynik = waliduj(JSON.parse(match[0]));
    if (process.env.NODE_ENV !== "production") console.log("[scan-receipt] odczyt:", JSON.stringify(wynik));
    return NextResponse.json(wynik);
  } catch (e) {
    const status = (e as { status?: number })?.status;
    const apiMsg = (e as { error?: { error?: { message?: string } } })?.error?.error?.message;
    console.error("[scan-receipt] AI error:", status ?? "", apiMsg ?? (e instanceof Error ? e.message : e));
    // Nie crashuj — zostaw użytkownikowi puste pola (z flagą błędu)
    return NextResponse.json({ ...PUSTY, _apiError: true });
  }
}
