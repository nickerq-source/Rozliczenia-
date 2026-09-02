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

/** Buduje pojedyncze zlecenia Artura i Żeni bezpośrednio z pozycji PDF. */
export function extractAutomaticLogisticsOrders(invoices: FakturaWeek[]): ZlecenieLog[] {
  const byId = new Map<string, ZlecenieLog>();

  for (const invoice of invoices) {
    for (const row of invoice.pdfImport?.sourceRows ?? []) {
      const notes = String(row.notes ?? "").trim();
      const isOrder = row.isAdditional === true || notes.length > 0;
      const date = row.date ?? "";
      const amount = Number(row.cost);
      const auto = resolveAuto(row);
      if (!isOrder || !date || !Number.isFinite(amount) || amount <= 0 || !auto) continue;
      if (!inSelectedRange(invoice, date)) continue;

      const id = automaticId(invoice.id, row);
      byId.set(id, {
        id,
        data: date,
        plate: auto.plate,
        kierowca: auto.kierowca,
        wartoscNetto: Math.round(amount * 100) / 100,
        opis: notes || "Brak opisu w Uwagach",
        source: "pdf",
        sourceInvoiceId: invoice.id,
        sourceOrderNumber: row.orderNumber || undefined,
      });
    }
  }

  return [...byId.values()].sort(
    (a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id)
  );
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
