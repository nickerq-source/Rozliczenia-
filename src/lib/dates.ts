// Pomocniki dat: polskie nazwy, tygodnie, generowanie kalendarza miesiąca

export const POLSKIE_DNI = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];
export const POLSKIE_DNI_KROTKO = ["Nie", "Pon", "Wt", "Śr", "Czw", "Pt", "Sob"];
export const POLSKIE_MIESIACE = [
  "", "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
  "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień",
];

export const ROK = 2026;
export const MIESIACE_ZAKRESU = [6, 7, 8, 9, 10, 11, 12] as const;

/** Formatuje datę jako DD.MM */
export function formatDDMM(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

/** Formatuje datę jako DD.MM.YYYY */
export function formatDDMMYYYY(date: Date): string {
  return `${formatDDMM(date)}.${date.getFullYear()}`;
}

/** Tworzy ciąg "YYYY-MM-DD" z obiektu Date */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parsuje "YYYY-MM-DD" do obiektu Date (czas: 12:00 aby uniknąć problemów DST) */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** Zwraca numer dnia tygodnia: 0=Nd, 1=Pon, ..., 6=Sob */
export function getDayOfWeek(iso: string): number {
  return parseISODate(iso).getDay();
}

export function isSobota(iso: string): boolean {
  return getDayOfWeek(iso) === 6;
}

export function isNiedziela(iso: string): boolean {
  return getDayOfWeek(iso) === 0;
}

/** Zwraca wszystkie daty miesiąca jako tablicę "YYYY-MM-DD" */
export function getDniMiesiaca(miesiac: number): string[] {
  const dates: string[] = [];
  const daysInMonth = new Date(ROK, miesiac, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${ROK}-${String(miesiac).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    dates.push(iso);
  }
  return dates;
}

export interface WeekRange {
  start: Date;
  end: Date;
  label: string; // "Faktura DD.MM–DD.MM.2026"
  days: string[]; // ISO daty w tym tygodniu
}

/**
 * Dzieli dni miesiąca na tygodnie pon–niedz.
 * Pierwszy i ostatni tydzień mogą być niepełne.
 */
export function getWeeksOfMonth(miesiac: number): WeekRange[] {
  const allDays = getDniMiesiaca(miesiac);
  const weeks: WeekRange[] = [];
  let currentWeek: string[] = [];

  for (const iso of allDays) {
    const dow = getDayOfWeek(iso);
    currentWeek.push(iso);

    // Niedziela kończy tydzień
    if (dow === 0 && currentWeek.length > 0) {
      pushWeek(currentWeek, weeks);
      currentWeek = [];
    }
  }

  // Zostałe dni po ostatniej niedzieli (niepełny tydzień na końcu)
  if (currentWeek.length > 0) {
    pushWeek(currentWeek, weeks);
  }

  return weeks;
}

function pushWeek(days: string[], weeks: WeekRange[]) {
  const start = parseISODate(days[0]);
  const end = parseISODate(days[days.length - 1]);
  const label = `Faktura ${formatDDMM(start)}–${formatDDMMYYYY(end)}`;
  weeks.push({ start, end, label, days: [...days] });
}

/**
 * Znajduje indeks tygodnia z największym pokryciem zakresu [od, do] (ISO).
 * Liczy, ile dni z zakresu PDF wpada w dni danego tygodnia (w obrębie miesiąca).
 * Zwraca -1 gdy żaden tydzień nie ma pokrycia (zakres poza miesiącem).
 */
export function findBestWeekForRange(
  weeks: WeekRange[],
  od: string,
  do_: string
): number {
  let bestIdx = -1;
  let bestCount = 0;
  for (let i = 0; i < weeks.length; i++) {
    // Porównanie leksykograficzne działa poprawnie dla "YYYY-MM-DD"
    const count = weeks[i].days.filter((d) => d >= od && d <= do_).length;
    if (count > bestCount) {
      bestCount = count;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** "06.06–07.06" z dwóch ISO dat */
export function formatRangeShort(odISO: string, doISO: string): string {
  return `${formatDDMM(parseISODate(odISO))}–${formatDDMM(parseISODate(doISO))}`;
}

/** "Faktura 06.06–07.06.2026" z dwóch ISO dat */
export function formatRangeLabel(odISO: string, doISO: string): string {
  return `Faktura ${formatDDMM(parseISODate(odISO))}–${formatDDMMYYYY(parseISODate(doISO))}`;
}

/** Polska nazwa dnia tygodnia (krótka) dla ISO daty */
export function nazwaSkrotDnia(iso: string): string {
  return POLSKIE_DNI_KROTKO[getDayOfWeek(iso)];
}

/** Polska nazwa dnia tygodnia (pełna) dla ISO daty */
export function nazwaDnia(iso: string): string {
  return POLSKIE_DNI[getDayOfWeek(iso)];
}

/** Numer dnia miesiąca */
export function nrDnia(iso: string): number {
  return parseISODate(iso).getDate();
}

/** Poprzedni dzień jako ISO */
export function poprzedniDzien(iso: string): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() - 1);
  return toISODate(d);
}
