import type { DaneMiesiaca, MiesiącId, WorkspaceData } from "./types";
import { domyslneDaneMiesiaca, obliczWynikMiesiaca } from "./business-logic";
import { MIESIACE_ZAKRESU } from "./dates";
import { getUstawienia, podatkiMiesiaca } from "./tax";
import { DEFAULT_FUEL_VEHICLE, recalculateWorkspaceFuelChains } from "./recalculate-fuel-chain";

export const PREVIEW_SECTIONS = ["start", "faktury", "kierowcy", "koszty", "wiecej", "zlecenia", "podatki", "wspolnicy", "raporty", "wiadomosci", "ustawienia"] as const;
export type PreviewSection = typeof PREVIEW_SECTIONS[number];
export interface PreviewLocation {
  month: MiesiącId;
  section: PreviewSection;
  driver: "zenia" | "rafal" | null;
  part: "dni" | "wyplata" | "umowa";
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
    section: PREVIEW_SECTIONS.includes(section as PreviewSection) ? section as PreviewSection : "start",
    driver: p.get("kierowca") === "rafal" ? "rafal" : p.get("kierowca") === "zenia" ? "zenia" : null,
    part: part === "wyplata" || part === "umowa" ? part : "dni",
    invoice: p.get("faktura"),
    filter: filter === "paliwo" || filter === "pozostale" ? filter : "wszystkie",
  };
}

export function previewSearch(location: PreviewLocation): string {
  const p = new URLSearchParams({ miesiac: String(location.month), sekcja: location.section });
  if (location.driver) p.set("kierowca", location.driver);
  if (location.part !== "dni") p.set("widok", location.part);
  if (location.invoice) p.set("faktura", location.invoice);
  if (location.filter !== "wszystkie") p.set("koszty", location.filter);
  return `?${p}`;
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

export interface PreviewDay {
  date: string;
  status: "praca" | "praca_zlecenia" | "urlop" | "postojowe" | "wolne";
  courses: number;
  ordersNet: number | null;
  leaveNet: number | null;
  note: string;
}

/** Trial net amounts only. Not a payroll engine and never an input to company accounting. */
export function previewDayNet(day: PreviewDay): number | null {
  if (day.status === "wolne") return 0;
  if (day.status === "postojowe") return 50;
  if (day.status === "urlop") return day.leaveNet;
  const courses = Math.max(0, Math.trunc(day.courses)) * 90;
  if (day.status === "praca_zlecenia" && day.ordersNet === null) return null;
  return Math.round((courses + (day.status === "praca_zlecenia" ? day.ordersNet ?? 0 : 0)) * 100) / 100;
}
