import test from "node:test";
import assert from "node:assert/strict";
import { calculateScaleTaxYtd } from "../src/lib/income-tax-calculation.ts";

const defaults = {
  incomeTaxScope: "company_division",
  companyDivisionTaxRate: 0.12,
  taxFreeAmount: 30_000,
  firstTaxThreshold: 120_000,
  firstTaxRate: 0.12,
  secondTaxRate: 0.32,
  taxReducingAmount: 3_600,
};

test("część tej samej firmy nie dostaje ponownie kwoty wolnej", () => {
  const ustawienia = {
    ...defaults,
    incomeTaxScope: "company_division",
    companyDivisionTaxRate: 0.12,
  };

  assert.equal(calculateScaleTaxYtd(10_768.56, ustawienia), 1_292.23);
});

test("część firmy może używać stawki 32% po przekroczeniu progu całej firmy", () => {
  const ustawienia = {
    ...defaults,
    incomeTaxScope: "company_division",
    companyDivisionTaxRate: 0.32,
  };

  assert.equal(calculateScaleTaxYtd(10_768.56, ustawienia), 3_445.94);
});

test("samodzielne rozliczenie zachowuje kwotę wolną", () => {
  const ustawienia = {
    ...defaults,
    incomeTaxScope: "standalone",
  };

  assert.equal(calculateScaleTaxYtd(10_768.56, ustawienia), 0);
});

test("strata działu nie generuje ujemnej rezerwy podatkowej", () => {
  const ustawienia = {
    ...defaults,
    incomeTaxScope: "company_division",
    companyDivisionTaxRate: 0.12,
  };

  assert.equal(calculateScaleTaxYtd(-5_000, ustawienia), 0);
});
