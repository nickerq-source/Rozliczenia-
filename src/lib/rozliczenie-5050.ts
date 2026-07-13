// Wspólna logika rozliczenia 50/50 Artur / Damian.
// Firma płaci "z firmy" i NIE tworzy prywatnego długu.
// net = (zapłacił Artur − zapłacił Damian) / 2:
//   net > 0 → Damian oddaje Arturowi net
//   net < 0 → Artur oddaje Damianowi |net|
//   net = 0 → rozliczone
// Zamknięcie miesiąca = Artur i Damian rozliczyli się przy zamknięciu, więc
// pozycje z zamkniętych miesięcy NIE liczą się do bieżącego salda (są widoczne
// na liście jako "rozliczone"). Odemknięcie miesiąca przywraca jego saldo.

import {
  DaneMiesiaca,
  KategoriaKosztu,
  KosztPayer,
  KosztVatInfo,
  MiesiącId,
  UstawieniaPodatkowe,
} from "./types";
import { rozbijWpis } from "./tax";
import { czyTankowanieWliczane, parseNum } from "./business-logic";

export type Zrodlo5050 = "tankowanie" | "koszt" | "leasing";

export interface Pozycja5050 {
  id: string;
  miesiac: MiesiącId;
  data: string;
  nazwa: string;
  kategoria: KategoriaKosztu;
  zrodlo: Zrodlo5050;
  paidBy: KosztPayer;
  brutto: number;
  netto: number;
  vat: number;
  includeInSplit: boolean;
  splitNote?: string;
  status?: string;
  zamknietyMiesiac: boolean; // miesiąc zamknięty → pozycja rozliczona, poza saldem
}

export interface Saldo5050 {
  liczba: number;
  kosztyRazem: number; // brutto pozycji wchodzących do 50/50 (tylko otwarte miesiące)
  arturPaid: number;
  damianPaid: number;
  firmaPaid: number; // pozycje 50/50 zapłacone przez firmę (osobno, bez długu)
  udzialArtura: number;
  udzialDamiana: number;
  net: number; // (arturPaid - damianPaid) / 2
  kto: "damian_arturowi" | "artur_damianowi" | "rozliczone";
  ile: number; // |net|
  rozliczoneZamkniete: number; // brutto pozycji 50/50 z zamkniętych miesięcy (saldo 0)
}

function normalizePayer(v: unknown): KosztPayer {
  return v === "Artur" || v === "Damian" || v === "Firma" ? v : "Firma";
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Wyciąga pozycje kosztów danego miesiąca w postaci znormalizowanej do 50/50. */
export function zbierzPozycjeMiesiaca(
  dane: DaneMiesiaca,
  ustawienia: UstawieniaPodatkowe,
  miesiac: MiesiącId
): Pozycja5050[] {
  const rows: Pozycja5050[] = [];
  const zamknietyMiesiac = !!dane.zamkniety?.locked;

  for (const t of dane.tankowanie ?? []) {
    if (!czyTankowanieWliczane(t)) continue; // tylko approved + include_in_reports
    if (parseNum(t.koszt) <= 0) continue;
    const wpis: KosztVatInfo & { koszt: number } = {
      ...t,
      kategoria: t.kategoria ?? "paliwo_adblue",
    };
    const r = rozbijWpis(wpis, ustawienia, "paliwo_adblue");
    rows.push({
      id: t.id,
      miesiac,
      data: t.expenseDate ?? t.data,
      nazwa: t.stationName ?? t.supplierName ?? "Tankowanie",
      kategoria: r.kategoria,
      zrodlo: "tankowanie",
      paidBy: normalizePayer(t.paidBy),
      brutto: r.brutto,
      netto: r.netto,
      vat: r.vat,
      includeInSplit: t.includeInSplit ?? true,
      splitNote: t.splitNote,
      status: t.status,
      zamknietyMiesiac,
    });
  }

  for (const k of dane.inneKoszty ?? []) {
    if (parseNum(k.koszt) <= 0) continue;
    const r = rozbijWpis(k, ustawienia, "inne");
    rows.push({
      id: k.id,
      miesiac,
      data: k.data,
      nazwa: k.nazwa || "Koszt",
      kategoria: r.kategoria,
      zrodlo: r.kategoria === "leasing" ? "leasing" : "koszt",
      paidBy: normalizePayer(k.paidBy),
      brutto: r.brutto,
      netto: r.netto,
      vat: r.vat,
      includeInSplit: k.includeInSplit ?? true,
      splitNote: k.splitNote,
      status: undefined,
      zamknietyMiesiac,
    });
  }

  return rows;
}

/** Zbiera pozycje z wielu miesięcy (rozliczenie narastająco). */
export function zbierzPozycje(
  miesiace: Partial<Record<MiesiącId, DaneMiesiaca>>,
  ustawienia: UstawieniaPodatkowe,
  zakres: MiesiącId[]
): Pozycja5050[] {
  const out: Pozycja5050[] = [];
  for (const m of zakres) {
    const dane = miesiace[m];
    if (dane) out.push(...zbierzPozycjeMiesiaca(dane, ustawienia, m));
  }
  return out;
}

/**
 * Saldo 50/50 z listy pozycji (liczy tylko includeInSplit z OTWARTYCH miesięcy).
 * Zamknięty miesiąc = rozliczony przy zamknięciu → jego pozycje mają saldo 0.
 */
export function podsumujSaldo(pozycje: Pozycja5050[]): Saldo5050 {
  const wszystkieSplit = pozycje.filter((p) => p.includeInSplit);
  const split = wszystkieSplit.filter((p) => !p.zamknietyMiesiac);
  const rozliczoneZamkniete = r2(
    wszystkieSplit.filter((p) => p.zamknietyMiesiac).reduce((s, p) => s + p.brutto, 0)
  );
  const suma = (payer: KosztPayer) =>
    split.filter((p) => p.paidBy === payer).reduce((s, p) => s + p.brutto, 0);

  const arturPaid = r2(suma("Artur"));
  const damianPaid = r2(suma("Damian"));
  const firmaPaid = r2(suma("Firma"));
  const prywatneRazem = arturPaid + damianPaid;
  const net = r2((arturPaid - damianPaid) / 2);
  const kto = Math.abs(net) < 0.01 ? "rozliczone" : net > 0 ? "damian_arturowi" : "artur_damianowi";

  return {
    liczba: split.length,
    kosztyRazem: r2(split.reduce((s, p) => s + p.brutto, 0)),
    arturPaid,
    damianPaid,
    firmaPaid,
    udzialArtura: r2(prywatneRazem / 2),
    udzialDamiana: r2(prywatneRazem / 2),
    net,
    kto,
    ile: Math.abs(net),
    rozliczoneZamkniete,
  };
}

/** Zdanie podsumowujące, kto komu oddaje. */
export function tekstSalda(saldo: Saldo5050, formatZl: (n: number) => string): string {
  if (saldo.kto === "rozliczone") return "Rozliczone — nikt nikomu nie oddaje.";
  if (saldo.kto === "damian_arturowi") return `Damian oddaje Arturowi: ${formatZl(saldo.ile)}`;
  return `Artur oddaje Damianowi: ${formatZl(saldo.ile)}`;
}

/** Co dana pozycja oznacza dla drugiej osoby (udział 50%). */
export function udzialDrugiej(p: Pozycja5050): { tekst: string; kwota: number } {
  if (!p.includeInSplit) return { tekst: "poza 50/50", kwota: 0 };
  if (p.paidBy === "Firma") return { tekst: "Firma — bez prywatnego rozliczenia", kwota: 0 };
  const polowa = r2(p.brutto / 2);
  if (p.paidBy === "Artur") return { tekst: "Damian ma oddać 50%", kwota: polowa };
  return { tekst: "Artur ma oddać 50%", kwota: polowa };
}
