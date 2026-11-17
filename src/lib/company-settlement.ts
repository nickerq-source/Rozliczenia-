import type { PodatkiMiesiaca } from "./tax";
import type { WynikMiesiaca } from "./types";
import { sumMoney } from "./invoice-settlement";

/** Shared by the monthly statement and the annual list of liabilities. VAT carry comes from the tax engine. */
export function companyTaxLiabilities(tax: PodatkiMiesiaca): number {
  return sumMoney([
    Math.max(0, tax.vatDoZaplaty), tax.pitMiesiac, tax.zdrowotna,
    tax.obciazeniaPracownika, tax.rafal.charges,
  ]);
}

export function companySettlementTotals(tax: PodatkiMiesiaca, result: WynikMiesiaca) {
  const driverPayouts = sumMoney([result.wynagrodzenieDoWyplaty, tax.rafal.payout]);
  const employeeCharges = sumMoney([tax.obciazeniaPracownika, tax.rafal.charges]);
  return {
    driverPayouts,
    employeeCharges,
    employmentCosts: sumMoney([driverPayouts, employeeCharges]),
    taxableEmploymentCosts: sumMoney([tax.wynagrodzeniePodatkowe, tax.rafal.taxCost]),
    purchaseCosts: sumMoney([result.paliwo, result.inne, result.leasing]),
    taxLiabilities: companyTaxLiabilities(tax),
    revenueGross: sumMoney([tax.sprzedazNetto, tax.vatNalezny]),
    finalCash: tax.cashflowPoPodatkach,
  };
}
