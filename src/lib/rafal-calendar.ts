import type { FleetDay } from "./fleet";
import { validateFleetDay } from "./fleet-commands";

export type CalendarDrafts = Record<string, { base: FleetDay | null; value: FleetDay }>;
export function sameCalendarDay(a: FleetDay | null | undefined, b: FleetDay | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.date === b.date && a.status === b.status && a.courses === b.courses
    && a.ordersNet === b.ordersNet && a.leaveNet === b.leaveNet && a.note === b.note;
}
export function calendarDraftConflicts(drafts: CalendarDrafts, saved: FleetDay[]): string[] {
  return Object.entries(drafts).filter(([date, draft]) => {
    const current = saved.find(day => day.date === date);
    return !sameCalendarDay(draft.base, current) && !sameCalendarDay(draft.value, current);
  }).map(([date]) => date);
}
export function mergeCalendarDrafts(drafts: CalendarDrafts, saved: FleetDay[]): FleetDay[] {
  return [...saved.filter(day => !drafts[day.date]), ...Object.values(drafts).map(draft => draft.value)].sort((a, b) => a.date.localeCompare(b.date));
}
export function restoreCalendarDrafts(raw: string, month: number, saved: FleetDay[]): CalendarDrafts {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Nieprawidłowy szkic dni.");
  const entries = Object.entries(parsed);
  if (entries.length > 31) throw new Error("Za dużo dni w szkicu.");
  const drafts: CalendarDrafts = {};
  for (const [date, candidate] of entries) {
    if (!candidate || typeof candidate !== "object") throw new Error("Nieprawidłowy dzień w szkicu.");
    const draft = candidate as CalendarDrafts[string];
    // Keep unfinished numeric edits recoverable; full financial validation happens on save.
    if (!draft.value || typeof draft.value.courses !== "number" || !Number.isFinite(draft.value.courses)
      || ![draft.value.ordersNet, draft.value.leaveNet].every(value => value === null || typeof value === "number" && Number.isFinite(value))) throw new Error("Nieprawidłowe pola szkicu.");
    validateFleetDay({ ...draft.value, courses: 0, ordersNet: null, leaveNet: null }, month);
    if (draft.base !== null) validateFleetDay(draft.base, month);
    if (draft.value.date !== date || draft.base && draft.base.date !== date) throw new Error("Niezgodna data szkicu.");
    if (!sameCalendarDay(draft.value, saved.find(day => day.date === date))) drafts[date] = draft;
  }
  return drafts;
}
