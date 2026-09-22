import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateMonthlyIncomeTaxByRate,
  normalizeMonthlyIncomeTaxRatePercent,
  resolveMonthlyIncomeTax,
} from "../src/lib/monthly-income-tax.ts";

test("liczy ręczny podatek od dodatniego dochodu miesiąca", () => {
  assert.equal(calculateMonthlyIncomeTaxByRate(10_000, 24), 2_400);
  assert.equal(calculateMonthlyIncomeTaxByRate(10_000, 32), 3_200);
});

test("strata nie tworzy podatku, a stawka jest ograniczona do 0-100%", () => {
  assert.equal(calculateMonthlyIncomeTaxByRate(-500, 24), 0);
  assert.equal(normalizeMonthlyIncomeTaxRatePercent(120), 100);
  assert.equal(normalizeMonthlyIncomeTaxRatePercent(-5), 0);
  assert.equal(normalizeMonthlyIncomeTaxRatePercent(null), null);
});

test("ręczna stawka zastępuje zaliczkę automatyczną i aktualizuje wartość narastającą", () => {
  assert.deepEqual(resolveMonthlyIncomeTax({
    taxableIncome: 10_000,
    manualRatePercent: 24,
    automaticCumulativeTax: 1_200,
    previouslyCalculatedTax: 500,
  }), {
    mode: "reczna_stawka",
    ratePercent: 24,
    currentMonthTax: 2_400,
    cumulativeTax: 2_900,
  });
});

test("bez ręcznej stawki zachowuje obliczenie narastające", () => {
  assert.deepEqual(resolveMonthlyIncomeTax({
    taxableIncome: 10_000,
    manualRatePercent: null,
    automaticCumulativeTax: 1_700,
    previouslyCalculatedTax: 500,
  }), {
    mode: "automatyczny",
    ratePercent: null,
    currentMonthTax: 1_200,
    cumulativeTax: 1_700,
  });
});
