import type { PDFDocumentCheck, PDFImportDiagnosticRow, PDFImportFilter, PDFRecordOverride } from "./types";

export const INVOICE_PARSER_VERSION = "zabka-columns-v2";

export function invoiceText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toUpperCase();
}

export function orderKey(value: string): string {
  return invoiceText(value).replace(/\s/g, "").replace(/\/[DI]$/, "");
}

export function invoiceDate(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

/** Parse the entire monetary cell; never take a number from another column. */
export function parseMoneyCents(value: string): number | null {
  const text = value.replace(/[\s\u00a0]/g, "").replace(",", ".");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.replace(/^-/, "").split(".");
  const cents = (Number(whole) * 100 + Number(fraction.padEnd(2, "0"))) * (text.startsWith("-") ? -1 : 1);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function moneyCents(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Nieprawidłowa kwota w rozliczeniu PDF");
  const cents = parseMoneyCents(value.toFixed(2));
  if (cents === null) throw new Error("Kwota w PDF przekracza dozwolony zakres");
  return cents;
}

export function sumMoney(values: number[]): number {
  const cents = values.reduce((sum, value) => sum + moneyCents(value), 0);
  if (!Number.isSafeInteger(cents)) throw new Error("Suma PDF przekracza dozwolony zakres");
  return cents / 100;
}

export function grossMoney(net: number, vatRate: number): number {
  const basisPoints = Math.round(vatRate * 10000);
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) throw new Error("Nieprawidłowa stawka VAT");
  const cents = moneyCents(net);
  const product = BigInt(Math.abs(cents)) * BigInt(10000 + basisPoints);
  const result = Number((product + BigInt(5000)) / BigInt(10000));
  if (!Number.isSafeInteger(result)) throw new Error("Kwota brutto przekracza dozwolony zakres");
  return Math.sign(cents) * result / 100;
}

export function isAdditionalInvoiceRow(row: PDFImportDiagnosticRow): boolean {
  if (row.orderKind) return row.orderKind === "I";
  const marker = row.orderNumber.match(/\/([DI])$/i)?.[1];
  if (marker) return marker.toUpperCase() === "I";
  // Old saved imports have no column provenance. Preserve their explicit flag until reimport.
  return row.isAdditional === true;
}

export function applyInvoiceCorrection(row: PDFImportDiagnosticRow, overrides: PDFRecordOverride[]): PDFImportDiagnosticRow {
  const override = overrides.find(item => orderKey(item.transportOrderId) === orderKey(row.orderNumber));
  if (!override?.correction) return { ...row, manuallyOverridden: !!override };
  const corrected = { ...row, ...override.correction, manuallyOverridden: true };
  const valid = !!corrected.driverName.trim() && /^\d+\/\d+$/.test(corrected.vehicleType) &&
    !!invoiceDate(corrected.date) && Number.isFinite(corrected.cost) && corrected.cost >= 0 &&
    Number.isFinite(corrected.km) && corrected.km >= 0 && !!corrected.orderKind;
  return { ...corrected, isAdditional: corrected.orderKind === "I", needsReview: !(valid && override.reviewConfirmed) };
}

export function checkInvoiceDocument(rows: PDFImportDiagnosticRow[], declared: number | null, warnings: string[] = []): PDFDocumentCheck {
  const parsedNetCents = moneyCents(sumMoney(rows.filter(row => Number.isFinite(row.cost)).map(row => row.cost)));
  const differenceCents = declared === null ? null : parsedNetCents - declared;
  return { declaredNetCents: declared, parsedNetCents, differenceCents, rowCount: rows.length,
    matched: differenceCents === 0 && warnings.length === 0, warnings };
}

/** Shared by API, editable preview and persistence. Source rows stay immutable. */
export function settleInvoiceRows(sourceRows: PDFImportDiagnosticRow[], filters: PDFImportFilter,
  overrides: PDFRecordOverride[] = [], vatRate = 0.23) {
  const includedRows: PDFImportDiagnosticRow[] = [];
  const rejectedRows: PDFImportDiagnosticRow[] = [];
  const reviewRows: PDFImportDiagnosticRow[] = [];
  const duplicateKeys = new Set(sourceRows.filter((row, index) => sourceRows.findIndex(other => orderKey(other.orderNumber) === orderKey(row.orderNumber)) !== index).map(row => orderKey(row.orderNumber)));
  for (const original of sourceRows) {
    const row = applyInvoiceCorrection(original, overrides);
    const override = overrides.find(item => orderKey(item.transportOrderId) === orderKey(row.orderNumber));
    const problems: string[] = [];
    if (row.needsReview) problems.push(...(row.parseWarnings?.length ? row.parseWarnings : ["niejednoznaczny odczyt kolumn"]));
    if (!row.driverName.trim()) problems.push("brak kierowcy");
    if (!/^\d+\/\d+$/.test(row.vehicleType)) problems.push("brak typu transportu");
    if (!invoiceDate(row.date)) problems.push("brak poprawnej daty załadunku");
    if (!Number.isFinite(row.cost) || row.cost < 0) problems.push("nieprawidłowa kwota");
    if (!Number.isFinite(row.km) || row.km < 0) problems.push("nieprawidłowe km");
    if (duplicateKeys.has(orderKey(row.orderNumber))) problems.push("powtórzony numer zlecenia w PDF");
    if (override && !override.includeInSettlement) {
      rejectedRows.push({ ...row, reason: override.exclusionReason || "ręcznie wykluczono" });
    } else if (problems.length) {
      reviewRows.push({ ...row, needsReview: true, reason: [...new Set(problems)].join(", ") });
    } else {
      const reasons: string[] = [];
      if (invoiceText(row.driverName) !== invoiceText(filters.driverName)) reasons.push("inny kierowca");
      if (invoiceText(row.vehicleType) !== invoiceText(filters.vehicleType)) reasons.push("inny typ transportu");
      if (row.date && ((filters.dateFrom && row.date < filters.dateFrom) || (filters.dateTo && row.date > filters.dateTo))) reasons.push("poza wybranym zakresem dat");
      const diagnostic = { ...row, isAdditional: isAdditionalInvoiceRow(row), reason: reasons.length ? reasons.join(", ") : `zgodny kierowca, typ i data; /${isAdditionalInvoiceRow(row) ? "I" : "D"}${override?.correction ? "; korekta administratora" : ""}` };
      (reasons.length ? rejectedRows : includedRows).push(diagnostic);
    }
  }
  const routes = includedRows.filter(row => !isAdditionalInvoiceRow(row));
  const orders = includedRows.filter(isAdditionalInvoiceRow);
  const kolkaNetto = sumMoney(routes.map(row => row.cost));
  const zleceniaNetto = sumMoney(orders.map(row => row.cost));
  const netto = sumMoney([kolkaNetto, zleceniaNetto]);
  const brutto = grossMoney(netto, vatRate);
  const kolkaBrutto = grossMoney(kolkaNetto, vatRate);
  const zleceniaBrutto = grossMoney(zleceniaNetto, vatRate);
  const vatRoundingDifference = sumMoney([brutto, -kolkaBrutto, -zleceniaBrutto]);
  const sumaKm = Math.round(includedRows.reduce((sum, row) => sum + row.km, 0) * 100) / 100;
  const count = includedRows.length;
  const dates = includedRows.flatMap(row => row.date ? [row.date] : []).sort();
  return { filters, sourceRows, includedRows, rejectedRows, reviewRows, vatRate,
    ileKolek: routes.length, ileZlecen: orders.length, kolkaNetto, kolkaBrutto,
    zleceniaNetto, zleceniaBrutto, vatRoundingDifference, netto, brutto, sumaKm,
    sredniaKm: count ? Math.round(sumaKm / count * 100) / 100 : 0,
    sredniaNetto: count ? Math.round(moneyCents(netto) / count) / 100 : 0,
    sredniaBrutto: count ? Math.round(moneyCents(brutto) / count) / 100 : 0,
    zakresOd: dates[0] ?? filters.dateFrom, zakresDo: dates.at(-1) ?? filters.dateTo };
}
