import test from "node:test";
import assert from "node:assert/strict";
import { calculateScaleTaxYtd } from "../src/lib/income-tax-calculation.ts";

const defaults = {
  incomeTaxScope: "company_division",
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
  };

  assert.equal(calculateScaleTaxYtd(10_768.56, ustawienia), 1_292.23);
});

test("część firmy liczy 32% wyłącznie od nadwyżki ponad 120 000 zł", () => {
  const ustawienia = {
    ...defaults,
    incomeTaxScope: "company_division",
  };

  assert.equal(calculateScaleTaxYtd(130_000, ustawienia), 17_600);
});

test("przekroczenie progu dzieli dochód między stawki 12% i 32%", () => {
  const ustawienia = {
    ...defaults,
    incomeTaxScope: "company_division",
  };

  assert.equal(calculateScaleTaxYtd(120_000, ustawienia), 14_400);
  assert.equal(calculateScaleTaxYtd(125_000, ustawienia), 16_000);
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
  };

  assert.equal(calculateScaleTaxYtd(-5_000, ustawienia), 0);
});
