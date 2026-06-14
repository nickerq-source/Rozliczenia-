// Etykiety i kolory typów dnia pracy (część E) — współdzielone przez UI i PDF.

import { DayType } from "./types";

export const TYP_DNIA_LABEL: Record<DayType, string> = {
  pracujacy: "pracujący",
  wolne: "wolne",
  urlop: "urlop",
  chorobowe: "chorobowe (L4)",
};

export interface TypDniaMeta {
  id: DayType;
  krotki: string; // P / W / U / L4
  label: string;
  // Klasy Tailwind dla badge w UI
  chipCls: string;
}

export const TYPY_DNIA: TypDniaMeta[] = [
  { id: "pracujacy", krotki: "P", label: "pracujący", chipCls: "border-line text-dim" },
  { id: "wolne", krotki: "W", label: "wolne", chipCls: "border-zinc-500/40 bg-zinc-500/15 text-zinc-300" },
  { id: "urlop", krotki: "U", label: "urlop", chipCls: "border-blue-500/40 bg-blue-500/15 text-blue-300" },
  { id: "chorobowe", krotki: "L4", label: "L4", chipCls: "border-purple-500/40 bg-purple-500/15 text-purple-300" },
];

export function typDniaMeta(t: DayType | undefined): TypDniaMeta {
  return TYPY_DNIA.find((x) => x.id === (t ?? "pracujacy")) ?? TYPY_DNIA[0];
}
