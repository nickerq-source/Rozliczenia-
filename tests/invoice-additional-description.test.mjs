import test from "node:test";
import assert from "node:assert/strict";

import { extractAdditionalDescription } from "../src/lib/invoice-additional-description.ts";

test("łączy pełny opis z kolejnych linii /I i usuwa nazwisko kierowcy", () => {
  const description = extractAdditionalDescription([
    "04465/08/26CLKR2 KRAKÓW YEVHENII 4/10 2026-08-04 46 1 1 04.08 426,74",
    "/I PITIANIN Pitianin -",
    "odbiór",
    "przyborów",
    "3mpl +km",
  ], "YEVHENII PITIANIN");

  assert.equal(description, "odbiór przyborów 3mpl +km");
});

test("zatrzymuje opis przed stopką dokumentu", () => {
  const description = extractAdditionalDescription([
    "10370/08/26CLKR2 KRAKÓW YEVHENII 4/10 2026-08-06 10 1 1 06.08 327,00",
    "/I PITIANIN Pitianin wyp",
    "przyborów",
    "2mpl",
    "Zleceniodawca Płatnik Odbiorca faktury",
    "Centrum Logistyczne Kraków",
  ], "YEVHENII PITIANIN");

  assert.equal(description, "wyp przyborów 2mpl");
});

test("zachowuje treść po nazwisku Artura", () => {
  const description = extractAdditionalDescription([
    "13556/08/26CLKR2 KRAKÓW ARTUR SZADY 4/10 2026-08-07 10 1 1 07.08 300,04",
    "/I SZADY 1mp",
    "odbiór kosza z akcyzy + KM",
  ], "ARTUR SZADY");

  assert.equal(description, "1mp odbiór kosza z akcyzy + KM");
});
