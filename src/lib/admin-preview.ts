import type { DaneMiesiaca, MiesiącId, WorkspaceData } from "./types";
import { invoiceText, sumMoney } from "./invoice-settlement";
import { fleetDayNet, type FleetDay } from "./fleet";
import { domyslneDaneMiesiaca, obliczWynikMiesiaca } from "./business-logic";
import { MIESIACE_ZAKRESU } from "./dates";
import { getUstawienia, podatkiMiesiaca } from "./tax";
import { DEFAULT_FUEL_VEHICLE, recalculateWorkspaceFuelChains } from "./recalculate-fuel-chain";

export const PREVIEW_SECTIONS = ["menu", "start", "faktury", "kierowcy", "koszty", "wiecej", "zlecenia", "podatki", "wspolnicy", "raporty", "wiadomosci", "ustawienia"] as const;
export type PreviewSection = typeof PREVIEW_SECTIONS[number];
export const DRIVER_PARTS = [["podsumowanie", "Podsumowanie"], ["dni", "Dni i wypłata"], ["faktury", "Pozycje z faktur"], ["paliwo", "Tankowania"], ["umowa", "Umowa i koszty"]] as const;
export const PREVIEW_DRIVERS = { zenia: "Yevhenii Pitianin", rafal: "Rafał Gustab" } as const;
export type PreviewDriverId = keyof typeof PREVIEW_DRIVERS;
export interface PreviewLocation {
  month: MiesiącId;
  section: PreviewSection;
  driver: "zenia" | "rafal" | null;
  part: typeof DRIVER_PARTS[number][0];
  invoice: string | null;
  filter: "wszystkie" | "paliwo" | "pozostale";
}

export function readPreviewLocation(search: string, fallback: MiesiącId): PreviewLocation {
  const p = new URLSearchParams(search);
  const month = Number(p.get("miesiac"));
  const section = p.get("sekcja");
  const part = p.get("widok");
  const filter = p.get("koszty");
  return {
    month: MIESIACE_ZAKRESU.some(m => m === month) ? month as MiesiącId : fallback,
    section: section === "wiecej" ? "menu" : PREVIEW_SECTIONS.includes(section as PreviewSection) ? section as PreviewSection : "menu",
    driver: p.get("kierowca") === "rafal" ? "rafal" : p.get("kierowca") === "zenia" ? "zenia" : null,
    part: part === "wyplata" ? "dni" : DRIVER_PARTS.some(([id]) => id === part) ? part as PreviewLocation["part"] : "podsumowanie",
    invoice: p.get("faktura"),
    filter: filter === "paliwo" || filter === "pozostale" ? filter : "wszystkie",
  };
}

export function previewSearch(location: PreviewLocation): string {
  const p = new URLSearchParams({ miesiac: String(location.month), sekcja: location.section });
  if (location.driver) p.set("kierowca", location.driver);
  if (location.part !== "podsumowanie") p.set("widok", location.part);
  if (location.invoice) p.set("faktura", location.invoice);
  if (location.filter !== "wszystkie") p.set("koszty", location.filter);
  return `?${p}`;
}

/** Exact, explicit identities only; never infer a driver from route/notes/vehicle. */
export function previewDriverMatches(name: string | undefined, driver: PreviewDriverId): boolean {
  const normalized = invoiceText(name);
  return driver === "zenia"
    ? ["YEVHENII PITIANIN", "PITIANIN YEVHENII", "ŻENIA", "ZENIA"].includes(normalized)
    : ["RAFAŁ GUSTAB", "RAFAL GUSTAB", "GUSTAB RAFAŁ", "GUSTAB RAFAL"].includes(normalized);
}

export function previewDriverEntries(dane: DaneMiesiaca, driver: PreviewDriverId) {
  const invoices = dane.faktury.flatMap(invoice => {
    const imported = invoice.pdfImport;
    if (!imported) return [];
    const rows = (imported.pozycjeUwzglednione ?? []).filter(row => !row.needsReview && previewDriverMatches(row.driverName, driver));
    const additions = (imported.dodatkiReczne ?? []).filter(row => row.addToInvoice && previewDriverMatches(row.driverName, driver));
    return rows.length || additions.length ? [{ invoice, rows, additions, netto: sumMoney([...rows.map(row => row.cost), ...additions.map(row => row.netto)]) }] : [];
  });
  return {
    invoices,
    assignedNet: sumMoney(invoices.map(group => group.netto)),
    // This is authorship, not an inferred allocation of the company's vehicle costs.
    fuel: dane.tankowanie.filter(row => previewDriverMatches(row.dodaneBy, driver)),
  };
}

/** Same read-time defaults as the legacy hook, on a detached copy, without its autosave. */
export function preparePreviewSnapshot(input: WorkspaceData): WorkspaceData {
  const remote = structuredClone(input);
  const miesiace: WorkspaceData["miesiace"] = {};
  for (const month of MIESIACE_ZAKRESU) {
    const id = month as MiesiącId;
    miesiace[id] = { ...domyslneDaneMiesiaca(id), ...remote.miesiace?.[id] };
  }
  return recalculateWorkspaceFuelChains({ ...remote, miesiace,
    vehicles: remote.vehicles?.length ? remote.vehicles : [DEFAULT_FUEL_VEHICLE],
  }).data;
}

export function previewMonth(data: WorkspaceData, month: MiesiącId) {
  const dane: DaneMiesiaca = data.miesiace[month] ?? domyslneDaneMiesiaca(month);
  const settings = getUstawienia(data);
  return { dane, settings, result: obliczWynikMiesiaca(month, dane, settings), tax: podatkiMiesiaca(data, month) };
}

export type PreviewDay = FleetDay;

/** Trial net amounts only. Not a payroll engine and never an input to company accounting. */
export function previewDayNet(day: PreviewDay): number | null {
  return fleetDayNet(day);
}
