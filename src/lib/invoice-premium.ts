import type { FakturaWeek, MiesiącId } from "./types";

function safePositive(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface PremiumInvoiceSplit {
  regularInvoices: FakturaWeek[];
  premiumInvoice: FakturaWeek;
}

/**
 * Oddziela jedną fakturę premiowaną od faktur zwykłych. Wartości zapisane przez
 * starszą wersję przy poszczególnych fakturach są przenoszone bez utraty danych.
 */
export function splitAndMigratePremiumInvoice(
  invoices: FakturaWeek[],
  miesiac: MiesiącId
): PremiumInvoiceSplit {
  const premiumEntries = invoices.filter((invoice) => invoice.rodzaj === "premiowana");
  const premiumTemplate = premiumEntries[0];
  const regularInvoices: FakturaWeek[] = [];
  let premiumNet = 0;
  let migratedVatRate: number | undefined;

  for (const invoice of invoices) {
    const legacyPremium = safePositive(invoice.premiowanaKwotaNetto);
    premiumNet += legacyPremium;
    if (legacyPremium > 0 && migratedVatRate === undefined && invoice.vatRate !== undefined) {
      migratedVatRate = invoice.vatRate;
    }
    if (invoice.rodzaj === "premiowana") {
      premiumNet += safePositive(invoice.kwota);
      continue;
    }

    const {
      premiowanaKwotaNetto: _legacyPremium,
      rodzaj: _kind,
      opisPremiowanej: _premiumDescription,
      ...regularInvoice
    } = invoice;
    void _legacyPremium;
    void _kind;
    void _premiumDescription;
    regularInvoices.push(regularInvoice);
  }

  const opisPremiowanej = premiumEntries
    .map((invoice) => invoice.opisPremiowanej)
    .find((description): description is string => Boolean(description?.trim()));

  return {
    regularInvoices,
    premiumInvoice: {
      id: premiumTemplate?.id || `premium-${miesiac}`,
      label: "Faktura premiowana",
      kwota: round2(premiumNet),
      rodzaj: "premiowana",
      opisPremiowanej,
      amountMode: "netto",
      vatRate: premiumTemplate?.vatRate ?? migratedVatRate,
    },
  };
}
