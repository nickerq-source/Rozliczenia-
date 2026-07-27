import test from "node:test";
import assert from "node:assert/strict";
import { wyjasnijPodatekMiesiaca } from "../src/lib/income-tax-explanation.ts";

const skala = {
  taxForm: "skala",
  taxFreeAmount: 30000,
};

test("pokazuje wykorzystanie wcześniejszej straty i kwotę pozostałą do rozliczenia", () => {
  const wynik = wyjasnijPodatekMiesiaca({
    dochod: 11105.13,
    dochodYtdPrzed: -15740.14,
    dochodYtd: -4635.01,
    pitYtd: 0,
    pitZaplaconyPrzed: 0,
    pitMiesiac: 0,
  }, skala);

  assert.equal(wynik.powod, "strata");
  assert.equal(wynik.strataPrzedMiesiacem, 15740.14);
  assert.equal(wynik.wykorzystanaStrata, 11105.13);
  assert.equal(wynik.pozostalaStrata, 4635.01);
});

test("odróżnia kwotę wolną od straty podatkowej", () => {
  const wynik = wyjasnijPodatekMiesiaca({
    dochod: 5000,
    dochodYtdPrzed: 10000,
    dochodYtd: 15000,
    pitYtd: 0,
    pitZaplaconyPrzed: 0,
    pitMiesiac: 0,
  }, skala);

  assert.equal(wynik.powod, "kwota_wolna");
  assert.equal(wynik.pozostalaStrata, 0);
  assert.equal(wynik.pozostalaKwotaWolna, 15000);
});

test("odróżnia wcześniej naliczone zaliczki od straty i kwoty wolnej", () => {
  const wynik = wyjasnijPodatekMiesiaca({
    dochod: -5000,
    dochodYtdPrzed: 50000,
    dochodYtd: 45000,
    pitYtd: 1800,
    pitZaplaconyPrzed: 2400,
    pitMiesiac: 0,
  }, skala);

  assert.equal(wynik.powod, "wczesniejsze_zaliczki");
  assert.equal(wynik.podatekNarastajaco, 1800);
  assert.equal(wynik.zaliczkiPoprzednie, 2400);
});
