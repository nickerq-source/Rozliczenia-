import type { TabName } from "../components/TabSwitch";
import type { MiesiącId } from "./types";
import { getDefaultMonth } from "./dates";

export type DriverId = "zenia" | "rafal";
export const DRIVER_NAMES = { zenia: "Yevhenii Pitianin", rafal: "Rafał Gustab" } as const;
export const DRIVER_VIEWS = [
  ["koszty", "Koszty kierowcy"], ["wyplata", "Dni i wypłata"],
  ["tankowanie", "Tankowanie"], ["samochod", "Samochód i działalność"],
  ["statystyki", "Statystyki tankowania"], ["faktury", "Pozycje z faktur"], ["umowa", "Umowa"],
] as const;
export type DriverView = typeof DRIVER_VIEWS[number][0];
export type AdminLocation = {
  area: "start" | "firma" | "kierowcy";
  driver?: DriverId;
  view: DriverView;
  tab: TabName;
  month: MiesiącId;
};
export const COMPANY_TABS: TabName[] = ["podsumowanie", "zarobek", "koszty", "zlecenia", "raport", "podatki", "wiadomosci", "legenda", "ustawienia"];
export function switchAdminDriver(location: AdminLocation, driver: DriverId): AdminLocation {
  return { ...location, area: "kierowcy", driver, view: driver === "zenia" && location.view === "umowa" ? "wyplata" : location.view };
}
export function readAdminLocation(search: string): AdminLocation {
  const p = new URLSearchParams(search);
  const month = Number(p.get("miesiac") ?? p.get("month"));
  const tab = p.get("zakladka") === "historia" ? "wiadomosci" : p.get("zakladka");
  const driver = p.get("kierowca");
  const area = p.get("menu");
  return {
    month: (month >= 6 && month <= 12 && Number.isInteger(month) ? month : getDefaultMonth()) as MiesiącId,
    area: area === "firma" || area === "kierowcy" ? area : tab ? p.has("zgloszenie") ? "kierowcy" : "firma" : "start",
    driver: driver === "zenia" || driver === "rafal" ? driver : p.has("zgloszenie") ? "zenia" : undefined,
    view: DRIVER_VIEWS.some(([id]) => id === p.get("widok")) ? p.get("widok") as DriverView : p.has("zgloszenie") ? "wyplata" : "koszty",
    tab: COMPANY_TABS.includes(tab as TabName) ? tab as TabName : "podsumowanie",
  };
}
export function adminSearch(location: AdminLocation): string {
  const p = new URLSearchParams({ miesiac: String(location.month) });
  if (location.area !== "start") p.set("menu", location.area);
  if (location.area === "firma") p.set("zakladka", location.tab);
  if (location.area === "kierowcy" && location.driver) { p.set("kierowca", location.driver); p.set("widok", location.view); }
  return `?${p}`;
}
