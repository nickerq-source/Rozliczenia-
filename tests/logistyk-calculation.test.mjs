import test from "node:test";
import assert from "node:assert/strict";

import { calculateLogisticsProfitShare } from "../src/lib/logistyk-calculation.ts";

test("sierpień liczy 5% od końcowej kwoty po odjęciu tylko zleceń Żeni", () => {
  const result = calculateLogisticsProfitShare(10_106.62, 3_427.06, 0.05);

  assert.deepEqual(result, { base: 6_679.56, commission: 333.98 });
});

test("zlecenia większe od końcowej gotówki zerują podstawę i prowizję", () => {
  const result = calculateLogisticsProfitShare(2_000, 3_000, 0.05);

  assert.deepEqual(result, { base: 0, commission: 0 });
});

test("niepoprawne i ujemne wartości nie tworzą ujemnej prowizji", () => {
  assert.deepEqual(calculateLogisticsProfitShare(Number.NaN, -100, 0.05), {
    base: 0,
    commission: 0,
  });
});
