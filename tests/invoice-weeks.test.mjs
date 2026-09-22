import test from "node:test";
import assert from "node:assert/strict";

import { orderAndNumberInvoiceSlots } from "../src/lib/invoice-ordering.ts";
import { splitAndMigratePremiumInvoice } from "../src/lib/invoice-premium.ts";

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

test("stare kwoty premiowane migruje do jednej osobnej faktury", () => {
  const result = splitAndMigratePremiumInvoice([
    { id: "w10-0", label: "Faktura 1", kwota: 1_000, premiowanaKwotaNetto: 120, vatRate: 0.08 },
    { id: "w10-1", label: "Faktura 2", kwota: 2_000, premiowanaKwotaNetto: 80 },
  ], 10);

  assert.equal(result.regularInvoices.length, 2);
  assert.equal("premiowanaKwotaNetto" in result.regularInvoices[0], false);
  assert.deepEqual(result.premiumInvoice, {
    id: "premium-10",
    label: "Faktura premiowana",
    kwota: 200,
    rodzaj: "premiowana",
    opisPremiowanej: undefined,
    amountMode: "netto",
    vatRate: 0.08,
  });
});

test("faktura premiowana zachowuje opis i pozostaje ostatnią pozycją", () => {
  const split = splitAndMigratePremiumInvoice([
    { id: "premium-8", label: "Faktura premiowana", kwota: 350, rodzaj: "premiowana", opisPremiowanej: "Premia za sierpień " },
    { id: "w8-2", label: "Faktura 3", kwota: 1_000, weekIndex: 2 },
    { id: "w8-0", label: "Faktura 1", kwota: 0, weekIndex: 0 },
  ], 8);
  const regular = orderAndNumberInvoiceSlots(split.regularInvoices.map((invoice, index) => ({
    ...invoice,
    empty: invoice.kwota === 0,
    sourceOrder: index,
  })));
  const all = [...regular, split.premiumInvoice];

  assert.equal(all[0].id, "w8-2");
  assert.equal(all.at(-1).id, "premium-8");
  assert.equal(all.at(-1).opisPremiowanej, "Premia za sierpień ");
});

test("ponowna normalizacja faktury premiowanej nie podwaja kwoty", () => {
  const first = splitAndMigratePremiumInvoice([
    { id: "premium-9", label: "Faktura premiowana", kwota: 425.5, rodzaj: "premiowana" },
  ], 9);
  const second = splitAndMigratePremiumInvoice([
    ...first.regularInvoices,
    first.premiumInvoice,
  ], 9);

  assert.equal(second.premiumInvoice.kwota, 425.5);
});
