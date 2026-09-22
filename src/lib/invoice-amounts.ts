import type { FakturaWeek } from "./types";

export interface InvoiceAmountSettings {
  invoiceAmountMode?: "netto" | "brutto";
  defaultSalesVatRate?: number;
}

export interface InvoiceAmounts {
  netto: number;
  vat: number;
  brutto: number;
}

const DEFAULT_AMOUNT_MODE = "netto";
const DEFAULT_VAT_RATE = 0.23;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function safeNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const parsed = Number.parseFloat(value.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Jedno źródło prawdy dla kwoty faktury sprzedażowej.
 * Import PDF przechowuje netto i brutto wprost. Ręczny wpis korzysta z trybu
 * zapisanego na fakturze albo z globalnych ustawień sprzedaży.
 */
export function calculateInvoiceAmounts(
  invoice: FakturaWeek,
  settings?: InvoiceAmountSettings
): InvoiceAmounts {
  const vatRate = Math.max(
    0,
    safeNumber(invoice.vatRate ?? settings?.defaultSalesVatRate ?? DEFAULT_VAT_RATE)
  );
  const premiumNet = round2(Math.max(0, safeNumber(invoice.premiowanaKwotaNetto)));
  const premiumVat = round2(premiumNet * vatRate);

  if (invoice.pdfImport && safeNumber(invoice.pdfImport.netto) > 0) {
    const baseNet = round2(safeNumber(invoice.pdfImport.netto));
    const baseGross = round2(
      safeNumber(invoice.pdfImport.brutto) > 0
        ? safeNumber(invoice.pdfImport.brutto)
        : baseNet * (1 + vatRate)
    );
    const netto = round2(baseNet + premiumNet);
    const vat = round2(baseGross - baseNet + premiumVat);
    return { netto, vat, brutto: round2(netto + vat) };
  }

  const amount = safeNumber(invoice.kwota);
  const amountMode =
    invoice.amountMode ?? settings?.invoiceAmountMode ?? DEFAULT_AMOUNT_MODE;

  if (amount <= 0) {
    return { netto: premiumNet, vat: premiumVat, brutto: round2(premiumNet + premiumVat) };
  }

  if (amountMode === "brutto") {
    const baseGross = round2(amount);
    const baseNet = round2(baseGross / (1 + vatRate));
    const netto = round2(baseNet + premiumNet);
    const vat = round2(baseGross - baseNet + premiumVat);
    return { netto, vat, brutto: round2(netto + vat) };
  }

  const netto = round2(amount + premiumNet);
  const vat = round2(netto * vatRate);
  return { netto, vat, brutto: round2(netto + vat) };
}

export function sumInvoiceGross(
  invoices: FakturaWeek[],
  settings?: InvoiceAmountSettings
): number {
  return round2(
    invoices.reduce(
      (sum, invoice) => sum + calculateInvoiceAmounts(invoice, settings).brutto,
      0
    )
  );
}

export function sumInvoiceNet(
  invoices: FakturaWeek[],
  settings?: InvoiceAmountSettings
): number {
  return round2(
    invoices.reduce(
      (sum, invoice) => sum + calculateInvoiceAmounts(invoice, settings).netto,
      0
    )
  );
}
