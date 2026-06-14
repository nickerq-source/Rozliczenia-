import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionProfile } from "@/lib/supabase-server";
import { VatRate } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * OCR paragonu/faktury ze zdjęcia (część B). Admin-only.
 * Przyjmuje obraz (base64 dataUrl), pyta Claude o dane, zwraca JSON do modala.
 * AI nigdy nie zapisuje kosztu — to robi użytkownik po sprawdzeniu.
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
}

const PUSTY: OdczytParagonu = {
  sprzedawca: null, nip: null, data: null, kwotaBrutto: null, vatRate: null, nazwa: null,
};

const PROMPT = `Odczytaj dane z tego paragonu lub faktury. Zwróć WYŁĄCZNIE JSON, bez komentarzy:
{"sprzedawca": "nazwa firmy lub null",
 "nip": "NIP cyframi bez kresek lub null",
 "data": "YYYY-MM-DD lub null",
 "kwotaBrutto": liczba (suma do zapłaty, brutto) lub null,
 "vatRate": jedna z "0","0.05","0.08","0.23","zw","np" — dominująca stawka VAT, lub null,
 "nazwa": "krótka nazwa zakupu, max 40 znaków (np. 'Paliwo Orlen', 'Olej silnikowy') lub null"}
Jeśli czegoś nie ma lub nie jesteś pewny — wpisz null. Nie zgaduj.`;

/** Wyciąga media_type i czyste base64 z dataUrl */
function parseDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return null;
  return { mediaType: m[1], data: m[2] };
}

function walidujVat(raw: unknown): VatRate | null {
  if (typeof raw === "string" && DOZWOLONE_VAT.includes(raw as VatRate)) return raw as VatRate;
  if (typeof raw === "number") {
    const s = String(raw);
    if (DOZWOLONE_VAT.includes(s as VatRate)) return s as VatRate;
  }
  return null;
}

function waliduj(raw: unknown): OdczytParagonu {
  if (!raw || typeof raw !== "object") return PUSTY;
  const o = raw as Record<string, unknown>;
  const dataStr = typeof o.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.data) ? o.data : null;
  const kwota =
    typeof o.kwotaBrutto === "number" && isFinite(o.kwotaBrutto) && o.kwotaBrutto > 0
      ? Math.round(o.kwotaBrutto * 100) / 100
      : null;
  return {
    sprzedawca: typeof o.sprzedawca === "string" ? o.sprzedawca.slice(0, 120) : null,
    nip: typeof o.nip === "string" ? o.nip.replace(/[^0-9]/g, "").slice(0, 15) || null : null,
    data: dataStr,
    kwotaBrutto: kwota,
    vatRate: walidujVat(o.vatRate),
    nazwa: typeof o.nazwa === "string" ? o.nazwa.slice(0, 60) : null,
  };
}

export async function POST(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "admin") {
    return NextResponse.json({ error: "Tylko dla administratora" }, { status: 403 });
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
                media_type: parsed.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
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
    if (!match) return NextResponse.json(PUSTY);
    return NextResponse.json(waliduj(JSON.parse(match[0])));
  } catch (e) {
    console.error("[scan-receipt] AI error:", e instanceof Error ? e.message : e);
    // Nie crashuj — zostaw użytkownikowi puste pola
    return NextResponse.json(PUSTY);
  }
}
