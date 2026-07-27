import test from "node:test";
import assert from "node:assert/strict";
import { calculateFinalCash } from "../src/lib/final-cash-calculation.ts";

const base = {
  profitBeforeTaxes: 9_203.18,
  incomeTax: 0,
  ownerHealthContribution: 999.46,
  vatDue: 2_933.05,
};

function round2(value) {
  return Math.round(value * 100) / 100;
}

test("wynik końcowy odejmuje dochodowy, zdrowotną i VAT", () => {
  const result = calculateFinalCash({
    ...base,
    incomeTax: 1_292.23,
  });

  assert.equal(result.afterIncomeTaxAndHealth, 6_911.49);
  assert.equal(result.afterAllTaxes, 3_978.44);
});

test("wzrost podatku dochodowego obniża obie kwoty końcowe dokładnie o tę samą wartość", () => {
  const before = calculateFinalCash(base);
  const after = calculateFinalCash({
    ...base,
    incomeTax: 1_292.23,
  });

  assert.equal(
    round2(before.afterIncomeTaxAndHealth - after.afterIncomeTaxAndHealth),
    1_292.23
  );
  assert.equal(
    round2(before.afterAllTaxes - after.afterAllTaxes),
    1_292.23
  );
});

test("nadwyżka VAT nie jest traktowana jak dodatkowa gotówka", () => {
  const result = calculateFinalCash({
    profitBeforeTaxes: 5_000,
    incomeTax: 600,
    ownerHealthContribution: 450,
    vatDue: -1_000,
  });

  assert.equal(result.afterAllTaxes, 3_950);
});
