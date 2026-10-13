import type { FakturaWeek, PDFImportAudit, PDFImportData, PDFImportDiagnosticRow, PDFImportFilter, PDFManualAddition, PDFRecordOverride } from "./types";
import { KIEROWCA, TYP_TRANSPORTU, VAT } from "./config";
import { applyInvoiceCorrection, checkInvoiceDocument, invoiceText, orderKey, settleInvoiceRows, sumMoney } from "./invoice-settlement";

export interface InvoicePreview extends PDFImportAudit {
  filters?: PDFImportFilter;
  ileKolek: number; ileZlecen?: number;
  kolkaNetto?: number; kolkaBrutto?: number; zleceniaNetto?: number; zleceniaBrutto?: number;
  sumaKm: number; netto: number; brutto: number; sredniaKm: number; sredniaNetto: number; sredniaBrutto: number;
  zakresOd: string | null; zakresDo: string | null;
  includedRows?: PDFImportDiagnosticRow[]; rejectedRows?: PDFImportDiagnosticRow[]; sourceRows?: PDFImportDiagnosticRow[];
  recordOverrides?: PDFRecordOverride[];
  invoiceImportDateFrom?: string | null; invoiceImportDateTo?: string | null; manualDateRangeSelected?: boolean;
  komentarz?: string; dodatkiReczne?: PDFManualAddition[];
  courseNetto?: number; courseBrutto?: number; manualAdditionsNetto?: number; manualAdditionsBrutto?: number;
  totalNetto?: number; totalBrutto?: number;
  vehicleAssignmentRules?: unknown[]; settlementVehiclePlate?: string | null; settlementVehicleMode?: "none" | "plate";
}

export function invoiceSourceRows(base: InvoicePreview): PDFImportDiagnosticRow[] {
  return base.sourceRows?.length ? base.sourceRows : [...(base.includedRows ?? []), ...(base.rejectedRows ?? []), ...(base.reviewRows ?? [])];
}

export function recalculateInvoiceImport(base: InvoicePreview, params: {
  dateFrom: string | null; dateTo: string | null; overrides: PDFRecordOverride[];
  manualDateRangeSelected: boolean; comment: string; additions: PDFManualAddition[];
}): InvoicePreview {
  const sourceRows = invoiceSourceRows(base);
  if (!sourceRows.length) return base;
  const result = settleInvoiceRows(sourceRows, {
    driverName: base.filters?.driverName || KIEROWCA, vehicleType: base.filters?.vehicleType || TYP_TRANSPORTU,
    dateFrom: params.dateFrom, dateTo: params.dateTo, settlementVehicleMode: "none", settlementVehiclePlate: null,
  }, params.overrides, base.vatRate ?? VAT);
  const additions = params.additions.filter(addition => addition.addToInvoice);
  const manualAdditionsNetto = sumMoney(additions.map(addition => addition.netto));
  const manualAdditionsBrutto = sumMoney(additions.map(addition => addition.brutto));
  const totalNetto = sumMoney([result.netto, manualAdditionsNetto]);
  const totalBrutto = sumMoney([result.brutto, manualAdditionsBrutto]);
  return { ...base, ...result, recordOverrides: params.overrides,
    invoiceImportDateFrom: params.dateFrom, invoiceImportDateTo: params.dateTo, manualDateRangeSelected: params.manualDateRangeSelected,
    settlementVehicleMode: "none", settlementVehiclePlate: null, komentarz: params.comment, dodatkiReczne: params.additions,
    courseNetto: result.netto, courseBrutto: result.brutto, manualAdditionsNetto, manualAdditionsBrutto, totalNetto, totalBrutto,
    netto: totalNetto, brutto: totalBrutto,
    documentCheck: base.documentCheck ? checkInvoiceDocument(sourceRows.map(row => applyInvoiceCorrection(row, params.overrides)),
      base.documentCheck.declaredNetCents, base.documentCheck.warnings) : undefined };
}

export function savedInvoicePreview(saved: PDFImportData): InvoicePreview {
  return { ...saved, includedRows: saved.pozycjeUwzglednione, rejectedRows: saved.pozycjeOdrzucone };
}

export function saveInvoicePreview(preview: InvoicePreview, name: string, number: string | null): PDFImportData {
  const { includedRows, rejectedRows, vehicleAssignmentRules: _legacyRules, ...rest } = preview;
  void _legacyRules;
  return { ...rest, nazwaPliku: name, numerFaktury: number, pozycjeUwzglednione: includedRows, pozycjeOdrzucone: rejectedRows };
}

/** Same date range is NOT identity: a main invoice and supplement may coexist. */
export function findInvoiceImportConflict(invoices: FakturaWeek[], number: string | null, preview: InvoicePreview, ignoreId?: string) {
  const keys = new Set((preview.includedRows ?? []).map(row => orderKey(row.orderNumber)));
  return invoices.find(invoice => {
    const saved = invoice.pdfImport;
    if (!saved || invoice.id === ignoreId) return false;
    const sameScope = invoiceText(saved.filters?.driverName ?? KIEROWCA) === invoiceText(preview.filters?.driverName ?? KIEROWCA) &&
      (saved.filters?.vehicleType ?? TYP_TRANSPORTU) === (preview.filters?.vehicleType ?? TYP_TRANSPORTU);
    if (!sameScope) return false;
    const sameDocumentRange = number && saved.numerFaktury === number &&
      (saved.invoiceImportDateFrom ?? saved.filters?.dateFrom ?? saved.zakresOd) === (preview.invoiceImportDateFrom ?? preview.filters?.dateFrom ?? preview.zakresOd) &&
      (saved.invoiceImportDateTo ?? saved.filters?.dateTo ?? saved.zakresDo) === (preview.invoiceImportDateTo ?? preview.filters?.dateTo ?? preview.zakresDo);
    return sameDocumentRange || (saved.pozycjeUwzglednione ?? []).some(row => keys.has(orderKey(row.orderNumber)));
  });
}
