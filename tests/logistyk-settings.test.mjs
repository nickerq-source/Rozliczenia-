import test from "node:test";
import assert from "node:assert/strict";

import {
  DOMYSLNE_USTAWIENIA_LOGISTYKA,
  getLogistykUstawienia,
} from "../src/lib/logistyk-settings.ts";

test("ustawienia historyczne bez nowych pól dostają dotychczasowe stawki", () => {
  assert.deepEqual(getLogistykUstawienia(), DOMYSLNE_USTAWIENIA_LOGISTYKA);
  assert.equal(DOMYSLNE_USTAWIENIA_LOGISTYKA.prowizjaZlecenProcent, 12);
  assert.equal(DOMYSLNE_USTAWIENIA_LOGISTYKA.prowizjaNaCzystoProcent, 5);
  assert.equal(DOMYSLNE_USTAWIENIA_LOGISTYKA.bonusZaAuto, 200);
});

test("zapisane przełączniki i stawki są zachowane", () => {
  const settings = getLogistykUstawienia({
    liczProwizjeZlecen: false,
    prowizjaZlecenProcent: 9.5,
    liczProwizjeNaCzysto: true,
    prowizjaNaCzystoProcent: 4,
    liczBonusZaAuta: false,
    bonusZaAuto: 175,
    liczFakturyDamiana: false,
  });

  assert.deepEqual(settings, {
    liczProwizjeZlecen: false,
    prowizjaZlecenProcent: 9.5,
    liczProwizjeNaCzysto: true,
    prowizjaNaCzystoProcent: 4,
    liczBonusZaAuta: false,
    bonusZaAuto: 175,
    liczFakturyDamiana: false,
  });
});

test("nieprawidłowe wartości nie psują obliczeń", () => {
  const settings = getLogistykUstawienia({
    ...DOMYSLNE_USTAWIENIA_LOGISTYKA,
    prowizjaZlecenProcent: 250,
    prowizjaNaCzystoProcent: Number.NaN,
    bonusZaAuto: -10,
  });

  assert.equal(settings.prowizjaZlecenProcent, 100);
  assert.equal(settings.prowizjaNaCzystoProcent, 5);
  assert.equal(settings.bonusZaAuto, 0);
});
