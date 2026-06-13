// Moduł podatkowy: rozbicie VAT kosztów, VAT należny ze sprzedaży,
// PIT (skala / liniowy, narastająco YTD) i składka zdrowotna.
// UWAGA: wyniki są szacunkiem pomocniczym — ostateczne rozliczenie potwierdza księgowa.

import {
  DaneMiesiaca,
  FakturaWeek,
  KategoriaKosztu,
  KosztVatInfo,
  MiesiącId,
  UstawieniaPodatkowe,
  VatRate,
  WorkspaceData,
  WpisInnegoKosztu,
  WpisTankowania,
} from "./types";
import { obliczWynagrodzenie, parseNum } from "./business-logic";
import { MIESIACE_ZAKRESU } from "./dates";

// ─── USTAWIENIA DOMYŚLNE ─────────────────────────────────────────────────────

export const DOMYSLNE_USTAWIENIA: UstawieniaPodatkowe = {
  defaultCostAmountMode: "brutto",
  defaultCostVatRate: "0.23",
  defaultCostHasInvoice: true,
  defaultCostVatDeductible: true,
  defaultCostVatDeductionPercent: 100,
  fuelVatDeductionPercent: 100,
  invoiceAmountMode: "netto",
  defaultSalesVatRate: 0.23,
  taxForm: "skala",
  taxFreeAmount: 30000,
  firstTaxThreshold: 120000,
  firstTaxRate: 0.12,
  secondTaxRate: 0.32,
  taxReducingAmount: 3600,
  linearTaxRate: 0.19,
  healthRateSkala: 0.09,
  healthRateLiniowy: 0.049,
  healthMinMonthly: 0,
  healthMinEnabled: true,
};

/** Ustawienia z danych workspace + domyślne dla brakujących pól */
export function getUstawienia(data: WorkspaceData): UstawieniaPodatkowe {
  return { ...DOMYSLNE_USTAWIENIA, ...(data.ustawienia ?? {}) };
}

// ─── KATEGORIE ───────────────────────────────────────────────────────────────

export const KATEGORIE: { id: KategoriaKosztu; label: string }[] = [
  { id: "serwis", label: "serwis" },
  { id: "czesci", label: "części" },
  { id: "paliwo_adblue", label: "paliwo/AdBlue" },
  { id: "parking", label: "parking" },
  { id: "myjnia", label: "myjnia" },
  { id: "oplaty", label: "opłaty" },
  { id: "ksiegowosc", label: "księgowość" },
  { id: "ubezpieczenie", label: "ubezpieczenie" },
  { id: "telefon_aplikacje", label: "telefon/aplikacje" },
  { id: "internet", label: "internet" },
  { id: "wyposazenie", label: "wyposażenie" },
  { id: "art_spozywcze", label: "art. spożywcze" },
  { id: "inne", label: "inne" },
];

export function kategoriaLabel(id: KategoriaKosztu | undefined): string {
  return KATEGORIE.find((k) => k.id === (id ?? "inne"))?.label ?? "inne";
}

/** Domyślne VAT dla kategorii (sekcja 7 specyfikacji) */
export function domyslnyVatKategorii(
  kategoria: KategoriaKosztu,
  ustawienia: UstawieniaPodatkowe
): { vatRate: VatRate; vatDeductible: boolean; vatDeductionPercent: number } {
  switch (kategoria) {
    case "paliwo_adblue":
      return {
        vatRate: "0.23",
        vatDeductible: true,
        vatDeductionPercent: ustawienia.fuelVatDeductionPercent,
      };
    case "ubezpieczenie":
      return { vatRate: "zw", vatDeductible: false, vatDeductionPercent: 0 };
    case "oplaty":
      return { vatRate: "np", vatDeductible: false, vatDeductionPercent: 0 };
    case "art_spozywcze":
      return { vatRate: "0.05", vatDeductible: true, vatDeductionPercent: 100 };
    default:
      return { vatRate: "0.23", vatDeductible: true, vatDeductionPercent: 100 };
  }
}

// ─── ROZBICIE VAT KOSZTU ─────────────────────────────────────────────────────

export interface RozbicieVat {
  netto: number;
  vat: number;
  vatDoOdliczenia: number;
  brutto: number;
  kosztPit: number; // netto + nieodliczalna część VAT
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function vatRateToNumber(rate: VatRate): number {
  if (rate === "zw" || rate === "np") return 0;
  return parseFloat(rate);
}

/**
 * Rozbija kwotę kosztu na netto / VAT / VAT do odliczenia / brutto / koszt PIT.
 * Reguły (sekcja 8): zw|np → brutto=netto=kwota; vatDeductible=false → koszt PIT = brutto.
 */
export function rozbijKoszt(
  kwota: number,
  amountMode: "netto" | "brutto",
  vatRate: VatRate,
  vatDeductible: boolean,
  vatDeductionPercent: number
): RozbicieVat {
  const amount = parseNum(kwota);
  const stawka = vatRateToNumber(vatRate);

  if (vatRate === "zw" || vatRate === "np" || stawka === 0) {
    return { netto: round2(amount), vat: 0, vatDoOdliczenia: 0, brutto: round2(amount), kosztPit: round2(amount) };
  }

  let netto: number, vat: number, brutto: number;
  if (amountMode === "brutto") {
    brutto = amount;
    netto = round2(brutto / (1 + stawka));
    vat = round2(brutto - netto);
  } else {
    netto = amount;
    vat = round2(netto * stawka);
    brutto = round2(netto + vat);
  }

  const procent = vatDeductible ? vatDeductionPercent : 0;
  const vatDoOdliczenia = round2((vat * procent) / 100);
  const kosztPit = round2(netto + (vat - vatDoOdliczenia));

  return { netto: round2(netto), vat, vatDoOdliczenia, brutto: round2(brutto), kosztPit };
}

/** Rozbicie VAT wpisu kosztowego z domyślnymi z ustawień (tankowanie → paliwo_adblue) */
export function rozbijWpis(
  wpis: KosztVatInfo & { koszt: number },
  ustawienia: UstawieniaPodatkowe,
  domyslnaKategoria: KategoriaKosztu = "inne"
): RozbicieVat & { kategoria: KategoriaKosztu } {
  const kategoria = wpis.kategoria ?? domyslnaKategoria;
  const defVat = domyslnyVatKategorii(kategoria, ustawienia);
  return {
    ...rozbijKoszt(
      wpis.koszt,
      wpis.amountMode ?? ustawienia.defaultCostAmountMode,
      wpis.vatRate ?? defVat.vatRate,
      wpis.vatDeductible ?? defVat.vatDeductible,
      wpis.vatDeductionPercent ?? defVat.vatDeductionPercent
    ),
    kategoria,
  };
}

// ─── VAT NALEŻNY ZE SPRZEDAŻY ────────────────────────────────────────────────

export interface VatFaktury {
  netto: number;
  vat: number;
  brutto: number;
}

/** VAT faktury sprzedażowej. Import PDF ma netto+brutto wprost; ręczna kwota wg trybu. */
export function vatFaktury(f: FakturaWeek, ustawienia: UstawieniaPodatkowe): VatFaktury {
  if (f.pdfImport && f.pdfImport.netto > 0) {
    const netto = round2(f.pdfImport.netto);
    const brutto = round2(f.pdfImport.brutto > 0 ? f.pdfImport.brutto : netto * (1 + ustawienia.defaultSalesVatRate));
    return { netto, vat: round2(brutto - netto), brutto };
  }
  const kwota = parseNum(f.kwota);
  if (kwota <= 0) return { netto: 0, vat: 0, brutto: 0 };
  const stawka = f.vatRate ?? ustawienia.defaultSalesVatRate;
  const mode = f.amountMode ?? ustawienia.invoiceAmountMode;
  if (mode === "brutto") {
    const netto = round2(kwota / (1 + stawka));
    return { netto, vat: round2(kwota - netto), brutto: round2(kwota) };
  }
  const vat = round2(kwota * stawka);
  return { netto: round2(kwota), vat, brutto: round2(kwota + vat) };
}

// ─── PIT ─────────────────────────────────────────────────────────────────────

/** PIT narastająco (YTD) wg skali: kwota wolna → 12% − kwota zmniejszająca → 32% powyżej progu */
export function pitSkalaYtd(incomeYtd: number, u: UstawieniaPodatkowe): number {
  if (incomeYtd <= u.taxFreeAmount) return 0;
  if (incomeYtd <= u.firstTaxThreshold) {
    return Math.max(0, round2(incomeYtd * u.firstTaxRate - u.taxReducingAmount));
  }
  const pitDoProgu = u.firstTaxThreshold * u.firstTaxRate - u.taxReducingAmount; // 10 800 przy domyślnych
  return Math.max(0, round2(pitDoProgu + (incomeYtd - u.firstTaxThreshold) * u.secondTaxRate));
}

/** PIT narastająco (YTD) liniowy: 19%, bez kwoty wolnej i progów */
export function pitLiniowyYtd(incomeYtd: number, u: UstawieniaPodatkowe): number {
  return Math.max(0, round2(incomeYtd * u.linearTaxRate));
}

export function pitYtd(incomeYtd: number, u: UstawieniaPodatkowe): number {
  return u.taxForm === "liniowy" ? pitLiniowyYtd(incomeYtd, u) : pitSkalaYtd(incomeYtd, u);
}

// ─── ZDROWOTNA ───────────────────────────────────────────────────────────────

/** Składka zdrowotna miesiąca: dochód × stawka (9% skala / 4,9% liniowy), min. składka opcjonalnie */
export function zdrowotnaMiesiaca(dochodMiesiaca: number, u: UstawieniaPodatkowe): number {
  const stawka = u.taxForm === "liniowy" ? u.healthRateLiniowy : u.healthRateSkala;
  let skladka = dochodMiesiaca > 0 ? round2(dochodMiesiaca * stawka) : 0;
  if (u.healthMinEnabled) skladka = Math.max(skladka, u.healthMinMonthly);
  return round2(skladka);
}

// ─── PODSUMOWANIE PODATKOWE MIESIĄCA ─────────────────────────────────────────

export interface PodatkiMiesiaca {
  miesiac: MiesiącId;
  // VAT
  sprzedazNetto: number;
  vatNalezny: number;
  kosztyNetto: number;
  vatNaliczony: number; // do odliczenia
  vatDoZaplaty: number; // ujemny = nadwyżka
  // PIT
  przychodNetto: number;
  kosztyPodatkowe: number;
  dochod: number; // może być ujemny (strata)
  dochodYtd: number;
  pitYtd: number;
  pitMiesiac: number;
  // Zdrowotna
  zdrowotna: number;
  // Zysk
  zyskPrzedPodatkami: number;
  zyskPoPodatkach: number;
  cashflowPoPodatkach: number;
}

/** Sumy VAT i kosztów podatkowych jednego miesiąca (bez YTD) */
function podstawyMiesiaca(m: MiesiącId, dane: DaneMiesiaca, u: UstawieniaPodatkowe) {
  // Sprzedaż
  let sprzedazNetto = 0, vatNalezny = 0, przychodBrutto = 0;
  for (const f of dane.faktury ?? []) {
    const v = vatFaktury(f, u);
    sprzedazNetto += v.netto;
    vatNalezny += v.vat;
    przychodBrutto += parseNum(f.kwota); // tak jak liczy P&L (kwota wpisana)
  }

  // Koszty z VAT (tankowanie = kategoria paliwo_adblue)
  let kosztyNetto = 0, vatNaliczony = 0, kosztyPitFaktury = 0, kosztyBrutto = 0;
  const wpisy: (KosztVatInfo & { koszt: number })[] = [
    ...((dane.tankowanie ?? []) as WpisTankowania[]).map((t) => ({ ...t, kategoria: t.kategoria ?? ("paliwo_adblue" as KategoriaKosztu) })),
    ...((dane.inneKoszty ?? []) as WpisInnegoKosztu[]),
  ];
  for (const w of wpisy) {
    const r = rozbijWpis(w, u);
    kosztyNetto += r.netto;
    vatNaliczony += r.vatDoOdliczenia;
    kosztyPitFaktury += r.kosztPit;
    kosztyBrutto += r.brutto;
  }

  // Koszty bez VAT: wynagrodzenie kierowcy + leasing
  const { wynagrodzenie } = obliczWynagrodzenie(m, dane.dni ?? {});

  // Miesiąc nieaktywny (brak sprzedaży, kosztów i pracy) nie wnosi nic do
  // podatków — w szczególności domyślny leasing pustych miesięcy nie jest
  // poniesionym kosztem i nie może zawyżać straty YTD.
  const aktywny = sprzedazNetto > 0 || kosztyNetto > 0 || wynagrodzenie > 0;
  if (!aktywny) {
    return {
      sprzedazNetto: 0, vatNalezny: 0, kosztyNetto: 0, vatNaliczony: 0,
      kosztyPodatkowe: 0, dochod: 0, zyskPrzedPodatkami: 0,
    };
  }

  const leasing = parseNum(dane.leasing);
  const kosztyPodatkowe = round2(kosztyPitFaktury + wynagrodzenie + leasing);
  const dochod = round2(sprzedazNetto - kosztyPodatkowe);
  const zyskPrzedPodatkami = round2(przychodBrutto - wynagrodzenie - kosztyBrutto - leasing);

  return {
    sprzedazNetto: round2(sprzedazNetto),
    vatNalezny: round2(vatNalezny),
    kosztyNetto: round2(kosztyNetto),
    vatNaliczony: round2(vatNaliczony),
    kosztyPodatkowe,
    dochod,
    zyskPrzedPodatkami,
  };
}

/**
 * Liczy podatki wszystkich miesięcy narastająco (PIT YTD).
 * pitMiesiac = max(0, pitYtd − pit zapłacony za poprzednie miesiące).
 */
export function podatkiRoku(data: WorkspaceData): PodatkiMiesiaca[] {
  const u = getUstawienia(data);
  const wyniki: PodatkiMiesiaca[] = [];
  let dochodYtd = 0;
  let pitZaplaconyYtd = 0;

  for (const m of MIESIACE_ZAKRESU) {
    const dane = (data.miesiace?.[m as MiesiącId] ?? { faktury: [], dni: {}, tankowanie: [], inneKoszty: [], leasing: 0 }) as DaneMiesiaca;
    const p = podstawyMiesiaca(m as MiesiącId, dane, u);

    dochodYtd = round2(dochodYtd + p.dochod);
    const pitNarastajaco = pitYtd(Math.max(0, dochodYtd), u);
    const pitMiesiac = Math.max(0, round2(pitNarastajaco - pitZaplaconyYtd));
    pitZaplaconyYtd = round2(pitZaplaconyYtd + pitMiesiac);

    const zdrowotna = zdrowotnaMiesiaca(p.dochod, u);
    const vatDoZaplaty = round2(p.vatNalezny - p.vatNaliczony);

    wyniki.push({
      miesiac: m as MiesiącId,
      sprzedazNetto: p.sprzedazNetto,
      vatNalezny: p.vatNalezny,
      kosztyNetto: p.kosztyNetto,
      vatNaliczony: p.vatNaliczony,
      vatDoZaplaty,
      przychodNetto: p.sprzedazNetto,
      kosztyPodatkowe: p.kosztyPodatkowe,
      dochod: p.dochod,
      dochodYtd,
      pitYtd: pitNarastajaco,
      pitMiesiac,
      zdrowotna,
      zyskPrzedPodatkami: p.zyskPrzedPodatkami,
      zyskPoPodatkach: round2(p.zyskPrzedPodatkami - pitMiesiac - zdrowotna),
      cashflowPoPodatkach: round2(
        p.zyskPrzedPodatkami - pitMiesiac - zdrowotna - Math.max(0, vatDoZaplaty)
      ),
    });
  }
  return wyniki;
}

export function podatkiMiesiaca(data: WorkspaceData, m: MiesiącId): PodatkiMiesiaca {
  return podatkiRoku(data).find((x) => x.miesiac === m)!;
}

// ─── KOSZTY WG KATEGORII (raport) ────────────────────────────────────────────

export interface KategoriaSuma {
  kategoria: KategoriaKosztu;
  label: string;
  suma: number; // brutto
  liczba: number;
}

export function kosztyWgKategorii(data: WorkspaceData): {
  kategorie: KategoriaSuma[];
  zrodla: { rule: number; ai: number; manual: number };
} {
  const u = getUstawienia(data);
  const mapa = new Map<KategoriaKosztu, KategoriaSuma>();
  const zrodla = { rule: 0, ai: 0, manual: 0 };

  for (const m of MIESIACE_ZAKRESU) {
    const dane = data.miesiace?.[m as MiesiącId];
    if (!dane) continue;
    const wpisy: (KosztVatInfo & { koszt: number })[] = [
      ...((dane.tankowanie ?? []) as WpisTankowania[]).map((t) => ({ ...t, kategoria: t.kategoria ?? ("paliwo_adblue" as KategoriaKosztu) })),
      ...((dane.inneKoszty ?? []) as WpisInnegoKosztu[]),
    ];
    for (const w of wpisy) {
      if (parseNum(w.koszt) <= 0) continue;
      const r = rozbijWpis(w, u);
      const cur = mapa.get(r.kategoria) ?? {
        kategoria: r.kategoria,
        label: kategoriaLabel(r.kategoria),
        suma: 0,
        liczba: 0,
      };
      cur.suma = round2(cur.suma + r.brutto);
      cur.liczba += 1;
      mapa.set(r.kategoria, cur);
      zrodla[w.kategoriaZrodlo ?? "manual"] += 1;
    }
  }

  return {
    kategorie: [...mapa.values()].sort((a, b) => b.suma - a.suma),
    zrodla,
  };
}
