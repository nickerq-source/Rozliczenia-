import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateInvoiceAmounts,
  sumInvoiceGross,
} from "../src/lib/invoice-amounts.ts";
import { calculateVatSettlement } from "../src/lib/vat-settlement.ts";
import {
  obliczObciazeniaPracownika,
  obliczWyplatePoPotraceniach,
} from "../src/lib/employee-costs.ts";
import { calculateFinalCash } from "../src/lib/final-cash-calculation.ts";
import { calculateOperatingResult } from "../src/lib/operating-result.ts";

const salesSettings = {
  invoiceAmountMode: "netto",
  defaultSalesVatRate: 0.23,
};

test("faktura ręczna netto i import PDF dają wspólną sumę brutto", () => {
  const manual = {
    id: "manual",
    label: "Faktura ręczna",
    kwota: 1_000,
  };
  const imported = {
    id: "pdf",
    label: "Faktura PDF",
    kwota: 1_875.07,
    pdfImport: {
      netto: 1_524.45,
      brutto: 1_875.07,
    },
  };

  assert.deepEqual(calculateInvoiceAmounts(manual, salesSettings), {
    netto: 1_000,
    vat: 230,
    brutto: 1_230,
  });
  assert.equal(sumInvoiceGross([manual, imported], salesSettings), 3_105.07);
});

test("nadwyżka VAT przechodzi na kolejny miesiąc i pomniejsza zapłatę", () => {
  const june = calculateVatSettlement({
    outputVat: 100,
    deductibleInputVat: 300,
    previousCarry: 0,
  });
  assert.equal(june.payableOrCarry, -200);
  assert.equal(june.nextCarry, 200);

  const july = calculateVatSettlement({
    outputVat: 500,
    deductibleInputVat: 100,
    previousCarry: june.nextCarry,
  });
  assert.equal(july.vatPayable, 200);
  assert.equal(july.nextCarry, 0);
});

test("potrącenia zmniejszają wypłatę gotówkową, ale nie dublują obciążeń pracownika", () => {
  const payout = obliczWyplatePoPotraceniach(6_350, 220);
  const employeeCharges = obliczObciazeniaPracownika(
    {
      pracownikPodatekDochodowyMies: 107,
      pracownikSkladkaZdrowotnaMies: 120.3,
      pracownikPozostaleSkladkiZusMies: 165,
    },
    true
  );

  assert.deepEqual(payout, {
    wynagrodzenieNaliczone: 6_350,
    potraceniaKierowcy: 220,
    wynagrodzenieDoWyplaty: 6_130,
  });
  assert.equal(employeeCharges.obciazeniaPracownika, 392.3);
});

test("pełny wynik miesiąca reaguje na brutto sprzedaży, koszty i każdy podatek", () => {
  const revenueGross = 21_533.27;
  const driverPayout = 6_090;
  const employeeCharges = 392.3;
  const fuel = 2_920.91;
  const otherCosts = 195.88;
  const leasing = 2_731;
  const operating = calculateOperatingResult({
    revenueGross,
    driverPayout,
    employeeCharges,
    fuel,
    otherCosts,
    leasing,
  });

  assert.deepEqual(operating, {
    operatingCosts: 12_330.09,
    cashBeforeTaxes: 9_203.18,
  });

  const final = calculateFinalCash({
    profitBeforeTaxes: operating.cashBeforeTaxes,
    incomeTax: 1_292.23,
    ownerHealthContribution: 999.46,
    vatDue: 2_933.05,
  });
  assert.deepEqual(final, {
    afterIncomeTaxAndHealth: 6_911.49,
    afterAllTaxes: 3_978.44,
  });
});
