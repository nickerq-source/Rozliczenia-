import type { FakturaWeek, PDFImportDiagnosticRow, ZlecenieLog } from "./types";

const ARTUR = { plate: "KK2063A", kierowca: "Artur" } as const;
const ZENIA = { plate: "KK9848Y", kierowca: "Żenia" } as const;

function normalize(value: string | undefined | null): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function resolveAuto(row: PDFImportDiagnosticRow): typeof ARTUR | typeof ZENIA | null {
  const driver = normalize(row.driverName);
  const route = normalize(row.route);

  if (driver.includes("YEVHENII") && driver.includes("PITIANIN")) return ZENIA;
  if (driver.includes("ARTUR") && driver.includes("SZADY")) return ARTUR;

  // Parser starszych PDF-ów potrafił przesunąć fragment trasy do nazwiska,
  // np. "SZADY KRAKÓW" przy trasie "KRAKÓW ARTUR".
  if (driver.startsWith("SZADY ") && /(^| )ARTUR($| )/.test(route)) return ARTUR;

  return null;
}

function inSelectedRange(invoice: FakturaWeek, date: string): boolean {
  const pdf = invoice.pdfImport;
  if (!pdf) return false;
  const from = pdf.filters?.dateFrom ?? pdf.invoiceImportDateFrom ?? pdf.zakresOd;
  const to = pdf.filters?.dateTo ?? pdf.invoiceImportDateTo ?? pdf.zakresDo;
  return (!from || date >= from) && (!to || date <= to);
}

function automaticId(invoiceId: string, row: PDFImportDiagnosticRow): string {
  const orderNumber = normalize(row.orderNumber).replace(/[^A-Z0-9]/g, "");
  return orderNumber
    ? `pdf:${orderNumber}`
    : `pdf:${invoiceId}:${row.date}:${Math.round(Number(row.cost) * 100)}`;
}

function isDateOnlyNote(value: string): boolean {
  return /^\d{1,2}[./-]\d{1,2}[.,]?(?:\s*[-–—,])?$/.test(value.trim());
}

function isDriverIdentityOnly(value: string, row: PDFImportDiagnosticRow): boolean {
  const noteTokens = normalize(value).split(" ").filter(Boolean);
  if (noteTokens.length === 0) return true;
  const identity = new Set(
    normalize(`${row.driverName} YEVHENII PITIANIN ARTUR SZADY`).split(" ").filter(Boolean)
  );
  return noteTokens.every((token) => identity.has(token));
}

function isExcludedAddon(row: PDFImportDiagnosticRow): boolean {
  const text = normalize(
    `${row.notes ?? ""} ${row.additionalDescription ?? ""} ${row.rawText ?? ""}`
  );
  return /\bDODATEK\b/.test(text) || /\bNIEDZIEL[A-Z]*\b/.test(text);
}

function buildAutomaticOrder(
  invoice: FakturaWeek,
  row: PDFImportDiagnosticRow,
  auto: typeof ARTUR | typeof ZENIA
): ZlecenieLog {
  const notes = String(row.notes ?? "").trim();
  const fullDescription = String(row.additionalDescription ?? "").trim();
  const usableNotes = !isDateOnlyNote(notes) && !isDriverIdentityOnly(notes, row) ? notes : "";
  const orderLabel = row.orderNumber ? `Zlecenie ${row.orderNumber}` : "Zlecenie z faktury";

  return {
    id: automaticId(invoice.id, row),
    data: row.date ?? "",
    plate: auto.plate,
    kierowca: auto.kierowca,
    wartoscNetto: Math.round(Number(row.cost) * 100) / 100,
    opis: fullDescription || usableNotes || orderLabel,
    source: "pdf",
    sourceInvoiceId: invoice.id,
    sourceOrderNumber: row.orderNumber || undefined,
    sourceNotes: notes || undefined,
    sourceDescription: fullDescription || undefined,
    sourceFileName: invoice.pdfImport?.nazwaPliku || undefined,
  };
}

export interface AutomaticLogisticsOrdersResult {
  included: ZlecenieLog[];
  excluded: ZlecenieLog[];
}

/** Buduje pojedyncze zlecenia Artura i Żeni bezpośrednio z pozycji PDF. */
export function extractAutomaticLogisticsOrderResult(
  invoices: FakturaWeek[]
): AutomaticLogisticsOrdersResult {
  const includedById = new Map<string, ZlecenieLog>();
  const excludedById = new Map<string, ZlecenieLog>();

  for (const invoice of invoices) {
    for (const row of invoice.pdfImport?.sourceRows ?? []) {
      const notes = String(row.notes ?? "").trim();
      const description = String(row.additionalDescription ?? "").trim();
      const isOrder = row.isAdditional === true || notes.length > 0 || description.length > 0;
      const date = row.date ?? "";
      const amount = Number(row.cost);
      const auto = resolveAuto(row);
      if (!isOrder || !date || !Number.isFinite(amount) || amount <= 0 || !auto) continue;
      if (!inSelectedRange(invoice, date)) continue;

      const order = buildAutomaticOrder(invoice, row, auto);
      if (isExcludedAddon(row)) {
        excludedById.set(order.id, order);
        includedById.delete(order.id);
      } else if (!excludedById.has(order.id)) {
        includedById.set(order.id, order);
      }
    }
  }

  const sortOrders = (orders: ZlecenieLog[]) => orders.sort(
    (a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id)
  );
  return {
    included: sortOrders([...includedById.values()]),
    excluded: sortOrders([...excludedById.values()]),
  };
}

export function extractAutomaticLogisticsOrders(invoices: FakturaWeek[]): ZlecenieLog[] {
  return extractAutomaticLogisticsOrderResult(invoices).included;
}

function duplicateKey(order: ZlecenieLog): string {
  return `${order.plate}|${order.data}|${Math.round(Number(order.wartoscNetto) * 100)}`;
}

/**
 * Usuwa z obliczeń stare ręczne kopie pozycji, które są już pobierane z PDF.
 * Licznik kluczy obsługuje kilka zleceń tego samego dnia za tę samą kwotę.
 */
export function splitManualOrderDuplicates(
  manual: ZlecenieLog[],
  automatic: ZlecenieLog[]
): { included: ZlecenieLog[]; duplicates: ZlecenieLog[] } {
  const available = new Map<string, number>();
  for (const order of automatic) {
    const key = duplicateKey(order);
    available.set(key, (available.get(key) ?? 0) + 1);
  }

  const included: ZlecenieLog[] = [];
  const duplicates: ZlecenieLog[] = [];
  for (const order of manual) {
    const key = duplicateKey(order);
    const count = available.get(key) ?? 0;
    if (count > 0) {
      available.set(key, count - 1);
      duplicates.push(order);
    } else {
      included.push(order);
    }
  }

  return { included, duplicates };
}
