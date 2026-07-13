import test from "node:test";
import assert from "node:assert/strict";
import { obliczObciazeniaPracownika } from "../src/lib/employee-costs.ts";

const ustawienia = {
  pracownikPodatekDochodowyMies: 107,
  pracownikSkladkaZdrowotnaMies: 120.30,
  pracownikPozostaleSkladkiZusMies: 165,
};

test("nalicza trzy miesięczne obciążenia pracownika do 392,30 zł", () => {
  assert.deepEqual(obliczObciazeniaPracownika(ustawienia, true), {
    podatekDochodowyPracownika: 107,
    skladkaZdrowotnaPracownika: 120.30,
    pozostaleSkladkiZusPracownika: 165,
    obciazeniaPracownika: 392.30,
  });
});

test("nie nalicza obciążeń w miesiącu bez wypłaty kierowcy", () => {
  assert.deepEqual(obliczObciazeniaPracownika(ustawienia, false), {
    podatekDochodowyPracownika: 0,
    skladkaZdrowotnaPracownika: 0,
    pozostaleSkladkiZusPracownika: 0,
    obciazeniaPracownika: 0,
  });
});

test("ujemne i niepoprawne stawki nie tworzą ujemnego kosztu", () => {
  const wynik = obliczObciazeniaPracownika({
    pracownikPodatekDochodowyMies: -10,
    pracownikSkladkaZdrowotnaMies: Number.NaN,
    pracownikPozostaleSkladkiZusMies: 165.005,
  }, true);

  assert.equal(wynik.podatekDochodowyPracownika, 0);
  assert.equal(wynik.skladkaZdrowotnaPracownika, 0);
  assert.equal(wynik.pozostaleSkladkiZusPracownika, 165.01);
  assert.equal(wynik.obciazeniaPracownika, 165.01);
});
