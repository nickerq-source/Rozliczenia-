import { getWeeksOfMonth, findBestWeekForRange, formatRangeLabel } from "@/lib/dates";
import { FakturaWeek, MiesiącId } from "@/lib/types";

function isValidWeekIndex(value: unknown, weekCount: number): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < weekCount;
}

/**
 * Zwraca tydzień faktury z zachowaniem zgodności ze starymi danymi, w których
 * tydzień wynikał wyłącznie z pozycji rekordu w tablicy.
 */
export function getInvoiceWeekIndex(
  invoice: FakturaWeek,
  arrayIndex: number,
  miesiac: MiesiącId
): number {
  const weeks = getWeeksOfMonth(miesiac);
  if (isValidWeekIndex(invoice.weekIndex, weeks.length)) return invoice.weekIndex;

  // Stare rekordy bazowe były zapisane dokładnie w kolejności tygodni.
  if (arrayIndex >= 0 && arrayIndex < weeks.length) return arrayIndex;

  const od = invoice.customRange?.od ?? invoice.pdfImport?.zakresOd;
  const do_ = invoice.customRange?.do ?? invoice.pdfImport?.zakresDo;
  if (od && do_) {
    const matched = findBestWeekForRange(weeks, od, do_);
    if (matched >= 0) return matched;
  }

  return Math.max(0, weeks.length - 1);
}

/**
 * Normalizuje miesiąc do modelu "wiele faktur na jeden tydzień" i dodaje
 * brakujące puste wiersze kalendarzowe. Nie scala wpisów o tych samych datach.
 */
export function normalizeMonthInvoices(
  savedInvoices: FakturaWeek[] | undefined,
  miesiac: MiesiącId
): FakturaWeek[] {
  const weeks = getWeeksOfMonth(miesiac);
  const usedIds = new Set<string>();

  const normalized = (savedInvoices ?? []).map((invoice, arrayIndex) => {
    const weekIndex = getInvoiceWeekIndex(invoice, arrayIndex, miesiac);
    const customRange = invoice.customRange ?? null;
    const baseId = invoice.id || `w${miesiac}-${weekIndex}-legacy-${arrayIndex}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    usedIds.add(id);

    return {
      ...invoice,
      id,
      weekIndex,
      customRange,
      label: customRange
        ? formatRangeLabel(customRange.od, customRange.do)
        : weeks[weekIndex].label,
      __order: arrayIndex,
    };
  });

  for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
    if (normalized.some((invoice) => invoice.weekIndex === weekIndex)) continue;

    let id = `w${miesiac}-${weekIndex}`;
    let suffix = 2;
    while (usedIds.has(id)) id = `w${miesiac}-${weekIndex}-${suffix++}`;
    usedIds.add(id);
    normalized.push({
      id,
      weekIndex,
      label: weeks[weekIndex].label,
      kwota: 0,
      customRange: null,
      __order: Number.MAX_SAFE_INTEGER,
    });
  }

  return normalized
    .sort((a, b) => (a.weekIndex ?? 0) - (b.weekIndex ?? 0) || a.__order - b.__order)
    .map(({ __order, ...invoice }) => {
      void __order;
      return invoice;
    });
}

export function isEmptyInvoiceSlot(invoice: FakturaWeek): boolean {
  return !invoice.pdfImport && Number(invoice.kwota ?? 0) === 0;
}

export function createAdditionalInvoiceId(miesiac: MiesiącId, weekIndex: number): string {
  const unique = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `w${miesiac}-${weekIndex}-${unique}`;
}
