import {
  DaneMiesiaca,
  KategoriaKosztu,
  KosztZalacznik,
  UstawieniaPodatkowe,
  VatRate,
  WpisTankowania,
} from "./types";
import { parseNum } from "./business-logic";
import { FuelReviewStatus } from "./fuel-calculations";
import { rozbijWpis } from "./tax";

export interface FuelStatsRow {
  id: string;
  data: string;
  kierowca: string | null;
  stacja: string | null;
  litry: number | null;
  cenaNettoZaLitr: number | null;
  cenaBruttoZaLitr: number | null;
  netto: number;
  vatRate: VatRate | null;
  vat: number;
  brutto: number;
  odometerKm: number | null;
  previousOdometerKm: number | null;
  kmSinceLastFuel: number | null;
  fuelBeforeRefuelLiters: number | null;
  costPerKmGross: number | null;
  costPerKmNet: number | null;
  fuelConsumptionLPer100Km: number | null;
  fuelStatus: FuelReviewStatus | null;
  needsReview: boolean;
  reviewReasons: string[];
  zalaczniki: KosztZalacznik[];
  pomijanyPowod?: string;
}

export interface FuelStatsSummary {
  liczbaTankowan: number;
  liczbaLiczona: number;
  sumaLitrow: number;
  netto: number;
  brutto: number;
  vat: number;
  sumaKm: number;
  srednieSpalanieLPer100Km: number | null;
  sredniKosztBruttoKm: number | null;
  sredniKosztNettoKm: number | null;
  sredniePaliwoPrzedTankowaniem: number | null;
  ok: number;
  doSprawdzenia: number;
  sredniaNettoZaLitr: number | null;
  sredniaBruttoZaLitr: number | null;
  pominiete: number;
}

export interface FuelStatsResult {
  rows: FuelStatsRow[];
  summary: FuelStatsSummary;
  filters: {
    kierowcy: string[];
    stacje: string[];
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isFuelEntry(t: WpisTankowania): boolean {
  return (t.kategoria ?? "paliwo_adblue") === "paliwo_adblue";
}

export function buildFuelStats(
  dane: DaneMiesiaca,
  ustawienia: UstawieniaPodatkowe,
  filters?: { kierowca?: string; stacja?: string }
): FuelStatsResult {
  const dev = process.env.NODE_ENV !== "production";
  const wpisy = (dane.tankowanie ?? []).filter(isFuelEntry);
  const rows: FuelStatsRow[] = [];

  if (dev) {
    console.log("[fuel-stats] entries:", wpisy.length, "filters:", filters ?? {});
  }

  for (const t of wpisy) {
    const kierowca = t.dodaneBy?.trim() || null;
    const stacja = t.supplierName?.trim() || null;
    if (filters?.kierowca && kierowca !== filters.kierowca) continue;
    if (filters?.stacja && stacja !== filters.stacja) continue;

    const litry = parseNum(t.litry);
    const r = rozbijWpis(
      { ...t, kategoria: (t.kategoria ?? "paliwo_adblue") as KategoriaKosztu },
      ustawienia,
      "paliwo_adblue"
    );
    const brutto = r.brutto > 0 ? r.brutto : round2(parseNum(t.koszt));
    const netto = r.netto;
    const vat = r.vat;
    const valid = litry > 0 && brutto > 0;
    const kmSinceLastFuel = parseNum(t.kmSinceLastFuel);
    const fuelBeforeRefuelLiters = parseNum(t.fuelBeforeRefuelLiters);
    const odometerKm = parseNum(t.odometerKm);
    const previousOdometerKm = parseNum(t.previousOdometerKm);
    const costPerKmGross = parseNum(t.costPerKmGross);
    const costPerKmNet = parseNum(t.costPerKmNet);
    const fuelConsumptionLPer100Km = parseNum(t.fuelConsumptionLPer100Km);

    const row: FuelStatsRow = {
      id: t.id,
      data: t.data,
      kierowca,
      stacja,
      litry: litry > 0 ? round2(litry) : null,
      cenaNettoZaLitr: litry > 0 && netto > 0 ? round2(netto / litry) : null,
      cenaBruttoZaLitr: litry > 0 && brutto > 0 ? round2(brutto / litry) : null,
      netto,
      vatRate: t.vatRate ?? "0.23",
      vat,
      brutto,
      odometerKm: odometerKm > 0 ? Math.round(odometerKm) : null,
      previousOdometerKm: previousOdometerKm > 0 ? Math.round(previousOdometerKm) : null,
      kmSinceLastFuel: kmSinceLastFuel > 0 ? round2(kmSinceLastFuel) : null,
      fuelBeforeRefuelLiters: fuelBeforeRefuelLiters > 0 ? round2(fuelBeforeRefuelLiters) : null,
      costPerKmGross: costPerKmGross > 0 ? round2(costPerKmGross) : null,
      costPerKmNet: costPerKmNet > 0 ? round2(costPerKmNet) : null,
      fuelConsumptionLPer100Km: fuelConsumptionLPer100Km > 0 ? round2(fuelConsumptionLPer100Km) : null,
      fuelStatus: t.fuelStatus ?? null,
      needsReview: !!t.needsReview,
      reviewReasons: t.reviewReasons ?? [],
      zalaczniki: t.zalaczniki ?? [],
      pomijanyPowod: valid ? undefined : "brak litrów lub kwoty",
    };

    if (dev) {
      console.log("[fuel-stats] row:", {
        id: row.id,
        data: row.data,
        litry: row.litry,
        brutto: row.brutto,
        skipped: row.pomijanyPowod ?? null,
        docs: row.zalaczniki.map((z) => ({ hasPath: !!z.storagePath, hasDataUrl: !!z.dataUrl })),
      });
    }

    rows.push(row);
  }

  rows.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));

  const counted = rows.filter((r) => !r.pomijanyPowod);
  const sumaLitrow = counted.reduce((s, r) => s + (r.litry ?? 0), 0);
  const netto = counted.reduce((s, r) => s + r.netto, 0);
  const brutto = counted.reduce((s, r) => s + r.brutto, 0);
  const vat = counted.reduce((s, r) => s + r.vat, 0);
  const countedKm = counted.filter((r) => (r.kmSinceLastFuel ?? 0) > 0);
  const sumaKm = countedKm.reduce((s, r) => s + (r.kmSinceLastFuel ?? 0), 0);
  const litryZeStatystyk = countedKm.reduce((s, r) => s + (r.litry ?? 0), 0);
  const bruttoZeStatystyk = countedKm.reduce((s, r) => s + r.brutto, 0);
  const nettoZeStatystyk = countedKm.reduce((s, r) => s + r.netto, 0);
  const fuelBeforeRows = rows.filter((r) => (r.fuelBeforeRefuelLiters ?? 0) > 0);
  const ok = rows.filter((r) => r.fuelStatus === "ok").length;
  const doSprawdzenia = rows.filter((r) => r.needsReview || r.fuelStatus !== "ok").length;

  const summary: FuelStatsSummary = {
    liczbaTankowan: rows.length,
    liczbaLiczona: counted.length,
    sumaLitrow: round2(sumaLitrow),
    netto: round2(netto),
    brutto: round2(brutto),
    vat: round2(vat),
    sumaKm: round2(sumaKm),
    srednieSpalanieLPer100Km: sumaKm > 0 ? round2((litryZeStatystyk / sumaKm) * 100) : null,
    sredniKosztBruttoKm: sumaKm > 0 ? round2(bruttoZeStatystyk / sumaKm) : null,
    sredniKosztNettoKm: sumaKm > 0 ? round2(nettoZeStatystyk / sumaKm) : null,
    sredniePaliwoPrzedTankowaniem:
      fuelBeforeRows.length > 0
        ? round2(fuelBeforeRows.reduce((s, r) => s + (r.fuelBeforeRefuelLiters ?? 0), 0) / fuelBeforeRows.length)
        : null,
    ok,
    doSprawdzenia,
    sredniaNettoZaLitr: sumaLitrow > 0 ? round2(netto / sumaLitrow) : null,
    sredniaBruttoZaLitr: sumaLitrow > 0 ? round2(brutto / sumaLitrow) : null,
    pominiete: rows.length - counted.length,
  };

  if (dev) {
    console.log("[fuel-stats] summary:", summary);
  }

  return {
    rows,
    summary,
    filters: {
      kierowcy: [...new Set(wpisy.map((t) => t.dodaneBy?.trim()).filter(Boolean) as string[])].sort(),
      stacje: [...new Set(wpisy.map((t) => t.supplierName?.trim()).filter(Boolean) as string[])].sort(),
    },
  };
}
