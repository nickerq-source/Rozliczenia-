import test from "node:test";
import assert from "node:assert/strict";

import { orderAndNumberInvoiceSlots } from "../src/lib/invoice-ordering.ts";

test("zajęte faktury przesuwa przed puste miejsca i numeruje bez luk", () => {
  const normalized = orderAndNumberInvoiceSlots([
    { id: "w9-0", weekIndex: 0, empty: true, sourceOrder: 0 },
    { id: "w9-1", weekIndex: 1, empty: true, sourceOrder: 1 },
    { id: "w9-2", weekIndex: 2, empty: false, sourceOrder: 2 },
    { id: "w9-3", weekIndex: 3, empty: true, sourceOrder: 3 },
    { id: "w9-4", weekIndex: 4, empty: true, sourceOrder: 4 },
  ]);

  assert.equal(normalized[0].id, "w9-2");
  assert.equal(normalized[0].displayLabel, "Faktura 1");
  assert.equal(normalized[1].displayLabel, "Faktura 2");
  assert.equal(normalized[0].weekIndex, 2);
});

test("sama kwota premiowana zajmuje pozycję faktury", () => {
  const normalized = orderAndNumberInvoiceSlots([
    { id: "w10-0", weekIndex: 0, empty: true, sourceOrder: 0 },
    { id: "w10-1", weekIndex: 1, empty: false, sourceOrder: 1 },
  ]);

  assert.equal(normalized[0].id, "w10-1");
  assert.equal(normalized[0].displayLabel, "Faktura 1");
});
