import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionProfile } from "@/lib/supabase-server";
import { dobierzVatLokalnie, kategoryzujLokalnie } from "@/lib/categorize";
import { KategoriaKosztu, VatRate } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Kategoryzacja kosztu: najpierw lokalne reguły keyword (darmowe, deterministyczne),
 * dopiero przy braku dopasowania AI fallback (claude-haiku-4-5).
 *
 * Bezpieczeństwo:
 * - tylko admin (sesja + rola sprawdzane server-side; driver → 403)
 * - ANTHROPIC_API_KEY wyłącznie server-side (nigdy NEXT_PUBLIC_)
 * - do AI idą tylko: name, amount, date + lista kategorii — nic więcej
 * - twarda walidacja odpowiedzi; cokolwiek niepoprawnego → bezpieczny fallback
 */

const KATEGORIE: KategoriaKosztu[] = [
  "serwis", "czesci", "paliwo_adblue", "parking", "myjnia", "oplaty",
  "ksiegowosc", "ubezpieczenie", "telefon_aplikacje", "internet",
  "wyposazenie", "art_spozywcze", "inne",
];
const PROCENTY = [0, 50, 100];

interface WynikKategoryzacji {
  category: KategoriaKosztu;
  vat_rate: VatRate;
  vat_deductible: boolean;
  vat_deduction_percent: number;
  amount_mode: "netto" | "brutto";
  confidence: number;
  source: "rule" | "ai" | "fallback";
}

const FALLBACK: WynikKategoryzacji = {
  category: "inne",
  vat_rate: "0.23",
  vat_deductible: true,
  vat_deduction_percent: 100,
  amount_mode: "brutto",
  confidence: 0,
  source: "fallback",
};

function stawkaToVatRate(raw: unknown): VatRate | null {
  if (typeof raw === "string") {
    const txt = raw.trim().toLowerCase().replace(",", ".").replace(/\s/g, "");
    if (txt === "zw" || txt === "zw." || txt.includes("zwoln")) return "zw";
    if (txt === "np" || txt === "np." || txt.includes("niepodlega")) return "np";
    const bezProcentu = txt.endsWith("%") ? txt.slice(0, -1) : txt;
    const n = Number(bezProcentu);
    if (!Number.isFinite(n)) return null;
    return stawkaToVatRate(n);
  }

  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const n = raw > 1 ? raw / 100 : raw;
  if (Math.abs(n - 0) < 0.0001) return "0";
  if (Math.abs(n - 0.05) < 0.0001) return "0.05";
  if (Math.abs(n - 0.08) < 0.0001) return "0.08";
  if (Math.abs(n - 0.23) < 0.0001) return "0.23";
  return null;
}

/** Twarda walidacja odpowiedzi AI — cokolwiek niepoprawnego → null (potem fallback) */
function walidujOdpowiedz(raw: unknown): WynikKategoryzacji | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const category = o.category;
  if (typeof category !== "string" || !KATEGORIE.includes(category as KategoriaKosztu)) return null;

  const vatRaw = o.vat_rate;
  const vatRate = stawkaToVatRate(vatRaw);
  if (!vatRate) return null;

  if (typeof o.vat_deductible !== "boolean") return null;

  const percent = Number(o.vat_deduction_percent);
  if (!PROCENTY.includes(percent)) return null;

  const mode = o.amount_mode;
  if (mode !== "netto" && mode !== "brutto") return null;

  const confidence = Number(o.confidence);
  if (isNaN(confidence) || confidence < 0 || confidence > 1) return null;

  return {
    category: category as KategoriaKosztu,
    vat_rate: vatRate,
    vat_deductible: o.vat_deductible,
    vat_deduction_percent: percent,
    amount_mode: mode,
    confidence,
    source: "ai",
  };
}

const PROMPT_SYSTEM = `Jesteś księgowym klasyfikującym koszty polskiej firmy transportowej.
Dobierasz kategorię ORAZ właściwą polską stawkę VAT dla danego towaru/usługi.
Zwróć wyłącznie JSON, bez komentarzy.

Dozwolone kategorie: serwis, czesci, paliwo_adblue, parking, myjnia, oplaty,
ksiegowosc, ubezpieczenie, telefon_aplikacje, internet, wyposazenie,
art_spozywcze, inne.

Dozwolone stawki VAT: 0, 0.05, 0.08, 0.23, "zw", "np".

POLSKIE STAWKI VAT — dobieraj wg rzeczywistego towaru/usługi, NIE domyślaj 23% gdy produkt ma niższą:
- 0.23 (podstawowa): części, oleje, opony, narzędzia, elektronika, paliwo, AdBlue,
  myjnia, parking, serwis/naprawa, telefon, internet, odzież robocza, większość usług.
- 0.08: usługi gastronomiczne i catering, hotele/noclegi, transport pasażerski,
  niektóre dania gotowe i napoje w gastronomii.
- 0.05: podstawowe artykuły spożywcze (chleb, pieczywo, nabiał, mleko, mięso, owoce,
  warzywa, woda, soki), książki, e-booki, czasopisma specjalistyczne.
- "zw" (zwolnione): ubezpieczenia (OC, AC, NNW), usługi finansowe/bankowe.
- "np" (nie podlega): opłaty urzędowe i administracyjne, podatki, opłaty drogowe/viaTOLL,
  badania/przeglądy w urzędzie.

vat_deductible=false TYLKO dla "zw" i "np" (wtedy vat_deduction_percent=0).
W pozostałych przypadkach vat_deductible=true, vat_deduction_percent=100.
amount_mode domyślnie "brutto".
Gdy naprawdę nie wiesz: category="inne", vat_rate=0.23, vat_deductible=true.

Zwróć JSON:
{"category":"...","vat_rate":0.08,"vat_deductible":true,
"vat_deduction_percent":100,"amount_mode":"brutto","confidence":0.82}`;

export async function POST(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "admin") {
    return NextResponse.json({ error: "Tylko dla administratora" }, { status: 403 });
  }

  let body: { name?: string; amount?: number; date?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Brak nazwy kosztu" }, { status: 400 });

  // Reguła keyword (offline-zapas, gdy AI niedostępne lub odpowie błędnie)
  const zReguly = () => {
    const k = kategoryzujLokalnie(name);
    if (!k) return FALLBACK;
    const vat = dobierzVatLokalnie(name, k);
    return {
      ...FALLBACK,
      category: k,
      vat_rate: vat.vatRate,
      vat_deductible: vat.vatDeductible,
      vat_deduction_percent: vat.vatDeductionPercent,
      confidence: 1,
      source: "rule" as const,
    };
  };

  // 1. AI dobiera kategorię ORAZ stawkę VAT dla KAŻDEGO kosztu (gdy mamy klucz).
  //    Brak klucza → spadamy na reguły/„inne" (VAT 23% / wg kategorii po stronie klienta).
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(zReguly());
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 256,
      system: PROMPT_SYSTEM,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            name,
            amount: typeof body.amount === "number" ? body.amount : undefined,
            date: typeof body.date === "string" ? body.date : undefined,
          }),
        },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Wyciągnij JSON (model może otoczyć go tekstem/markdownem)
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json(zReguly());

    const wynik = walidujOdpowiedz(JSON.parse(match[0]));
    return NextResponse.json(wynik ?? zReguly());
  } catch (e) {
    // Błąd AI nie może wywalić aplikacji — spadamy na reguły / 'inne'
    console.error("[categorize-cost] AI error:", e instanceof Error ? e.message : e);
    return NextResponse.json(zReguly());
  }
}
