import test from "node:test";
import assert from "node:assert/strict";

import {
  extractAutomaticLogisticsOrderResult,
  extractAutomaticLogisticsOrders,
  splitManualOrderDuplicates,
} from "../src/lib/logistyk-orders.ts";

const invoice = {
  id: "w8-1",
  label: "Faktura 01.08-08.08.2026",
  kwota: 1000,
  pdfImport: {
    ileKolek: 1,
    sumaKm: 1,
    netto: 1,
    brutto: 1,
    sredniaKm: 1,
    sredniaNetto: 1,
    sredniaBrutto: 1,
    zakresOd: "2026-08-01",
    zakresDo: "2026-08-08",
    nazwaPliku: "test.pdf",
    numerFaktury: "1",
    filters: {
      driverName: "YEVHENII PITIANIN",
      vehicleType: "4/10",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-08",
    },
    sourceRows: [
      {
        orderNumber: "ZEN-1",
        date: "2026-08-02",
        driverName: "YEVHENII PITIANIN",
        vehicleType: "4/10",
        route: "KRAKÓW",
        km: 10,
        cost: 248,
        notes: "02.08",
        additionalDescription: "odbiór przyborów 3mpl +km",
        status: "",
        invitationId: null,
        vehicleOwner: "unknown",
        isAdditional: true,
        reason: "",
      },
      {
        orderNumber: "ART-1",
        date: "2026-08-07",
        driverName: "SZADY SZADY",
        vehicleType: "4/10",
        route: "KRAKÓW ARTUR",
        km: 10,
        cost: 300.04,
        notes: "Odbiór kosza",
        additionalDescription: "1mp odbiór kosza z akcyzy + KM",
        status: "",
        invitationId: null,
        vehicleOwner: "unknown",
        isAdditional: true,
        reason: "",
      },
      {
        orderNumber: "ART-DODATEK",
        date: "2026-08-07",
        driverName: "ARTUR SZADY",
        vehicleType: "4/10",
        route: "KRAKÓW",
        km: 0,
        cost: 500,
        notes: "DODATEK",
        additionalDescription: "dodatek za pracę",
        status: "",
        invitationId: null,
        vehicleOwner: "unknown",
        isAdditional: true,
        reason: "",
      },
      {
        orderNumber: "ZEN-NIEDZIELA",
        date: "2026-08-08",
        driverName: "YEVHENII PITIANIN",
        vehicleType: "4/10",
        route: "KRAKÓW",
        km: 0,
        cost: 450,
        notes: "",
        additionalDescription: "premia za niedzielę",
        status: "",
        invitationId: null,
        vehicleOwner: "unknown",
        isAdditional: true,
        reason: "",
      },
      {
        orderNumber: "ZEN-MANDAT",
        date: "2026-08-08",
        driverName: "YEVHENII PITIANIN",
        vehicleType: "4/10",
        route: "KRAKÓW",
        km: 0,
        cost: 50,
        notes: "MANDAT KARNY",
        additionalDescription: "zwrot za mandat karny z 31.08",
        status: "",
        invitationId: null,
        vehicleOwner: "unknown",
        isAdditional: true,
        reason: "",
      },
      {
        orderNumber: "NORMAL-1",
        date: "2026-08-07",
        driverName: "ARTUR SZADY",
        vehicleType: "4/10",
        route: "KRAKÓW",
        km: 10,
        cost: 400,
        notes: "",
        status: "",
        invitationId: null,
        vehicleOwner: "unknown",
        isAdditional: false,
        reason: "",
      },
    ],
  },
};

test("tworzy z PDF zlecenia Żeni i Artura z kwotą oraz opisem z Uwag", () => {
  const result = extractAutomaticLogisticsOrders([invoice]);

  assert.deepEqual(
    result.map(({ data, plate, kierowca, wartoscNetto, opis }) => ({
      data,
      plate,
      kierowca,
      wartoscNetto,
      opis,
    })),
    [
      {
        data: "2026-08-02",
        plate: "KK9848Y",
        kierowca: "Żenia",
        wartoscNetto: 248,
        opis: "odbiór przyborów 3mpl +km",
      },
      {
        data: "2026-08-07",
        plate: "KK2063A",
        kierowca: "Artur",
        wartoscNetto: 300.04,
        opis: "1mp odbiór kosza z akcyzy + KM",
      },
    ]
  );
});

test("wyklucza z prowizji pozycje opisane jako dodatek albo niedziela", () => {
  const result = extractAutomaticLogisticsOrderResult([invoice]);

  assert.deepEqual(result.included.map((order) => order.sourceOrderNumber), ["ZEN-1", "ART-1"]);
  assert.deepEqual(
    result.excluded.map((order) => order.sourceOrderNumber),
    ["ART-DODATEK", "ZEN-MANDAT", "ZEN-NIEDZIELA"]
  );
  assert.equal(result.excluded[0].sourceExclusionReason, "Opis zawiera słowo „dodatek”");
  assert.equal(
    result.excluded[1].sourceExclusionReason,
    "Opis zawiera słowo „mandat” — to rozliczenie, nie zlecenie"
  );
  assert.equal(result.excluded[2].sourceExclusionReason, "Opis zawiera odmianę słowa „niedziela”");
});

test("ręczne przywrócenie odrzuconej pozycji wchodzi do rozliczenia", () => {
  const result = extractAutomaticLogisticsOrderResult([invoice]);
  const override = {
    ...result.excluded[0],
    id: "manual-rejected-override",
    source: "manual",
    sourceRejectedOverride: true,
  };

  const split = splitManualOrderDuplicates([override], result.included);
  assert.deepEqual(split.included.map((order) => order.id), ["manual-rejected-override"]);
  assert.equal(split.duplicates.length, 0);
});

test("stary skrót daty nie jest pokazywany drugi raz jako opis", () => {
  const oldInvoice = structuredClone(invoice);
  oldInvoice.pdfImport.sourceRows = [{
    ...oldInvoice.pdfImport.sourceRows[0],
    orderNumber: "ZEN-DATE",
    notes: "04.08",
    additionalDescription: undefined,
  }];

  const [order] = extractAutomaticLogisticsOrders([oldInvoice]);
  assert.equal(order.opis, "Zlecenie ZEN-DATE");
  assert.equal(order.sourceNotes, "04.08");
});

test("ręczna kopia pozycji PDF nie wchodzi drugi raz do rozliczenia", () => {
  const automatic = extractAutomaticLogisticsOrders([invoice]);
  const manual = [
    {
      id: "manual-duplicate",
      data: "2026-08-07",
      plate: "KK2063A",
      kierowca: "Artur",
      wartoscNetto: 300.04,
      opis: "opis wpisany ręcznie",
    },
    {
      id: "manual-new",
      data: "2026-08-08",
      plate: "KK8108N",
      kierowca: "Damian",
      wartoscNetto: 500,
    },
  ];

  const result = splitManualOrderDuplicates(manual, automatic);

  assert.deepEqual(result.included.map((order) => order.id), ["manual-new"]);
  assert.deepEqual(result.duplicates.map((order) => order.id), ["manual-duplicate"]);
});

test("osobna faktura Damiana dodaje zlecenia z opisem i kwotą", () => {
  const dedicatedInvoice = {
    id: "damian-1",
    nazwaPliku: "damian.pdf",
    numerFaktury: "5812009999",
    plate: "KK8108N",
    kierowca: "Damian",
    importedAt: "2026-08-31T12:00:00.000Z",
    pdfImport: {
      ileKolek: 0,
      ileZlecen: 2,
      sumaKm: 0,
      netto: 420.1,
      brutto: 516.72,
      sredniaKm: 0,
      sredniaNetto: 210.05,
      sredniaBrutto: 258.36,
      zakresOd: "2026-08-13",
      zakresDo: "2026-08-16",
      nazwaPliku: "damian.pdf",
      numerFaktury: "5812009999",
      sourceRows: [
        {
          orderNumber: "DAM-1",
          date: "2026-08-13",
          driverName: "INNY FORMAT NAZWY",
          vehicleType: "",
          route: "",
          km: 0,
          cost: 380.1,
          notes: "Odbiór przyborów",
          additionalDescription: "Odbiór przyborów z magazynu",
          status: "",
          invitationId: null,
          vehicleOwner: "unknown",
          isAdditional: true,
          reason: "",
        },
        {
          orderNumber: "DAM-2",
          date: "2026-08-16",
          driverName: "",
          vehicleType: "",
          route: "",
          km: 0,
          cost: 40,
          notes: "Odbiór akcyzy",
          status: "",
          invitationId: null,
          vehicleOwner: "unknown",
          isAdditional: true,
          reason: "",
        },
      ],
    },
  };

  const result = extractAutomaticLogisticsOrders([], [dedicatedInvoice]);

  assert.deepEqual(
    result.map(({ plate, kierowca, wartoscNetto, opis }) => ({
      plate,
      kierowca,
      wartoscNetto,
      opis,
    })),
    [
      {
        plate: "KK8108N",
        kierowca: "Damian",
        wartoscNetto: 380.1,
        opis: "Odbiór przyborów z magazynu",
      },
      {
        plate: "KK8108N",
        kierowca: "Damian",
        wartoscNetto: 40,
        opis: "Odbiór akcyzy",
      },
    ]
  );
});

test("osobna faktura Damiana nadal odrzuca dodatki i niedziele", () => {
  const dedicatedInvoice = {
    id: "damian-rejected",
    nazwaPliku: "damian-dodatek.pdf",
    numerFaktury: "5812009998",
    plate: "KK8108N",
    kierowca: "Damian",
    importedAt: "2026-08-31T12:00:00.000Z",
    pdfImport: {
      ileKolek: 0,
      sumaKm: 0,
      netto: 165,
      brutto: 202.95,
      sredniaKm: 0,
      sredniaNetto: 165,
      sredniaBrutto: 202.95,
      zakresOd: "2026-08-17",
      zakresDo: "2026-08-17",
      nazwaPliku: "damian-dodatek.pdf",
      numerFaktury: "5812009998",
      sourceRows: [
        {
          orderNumber: "DAM-DODATEK",
          date: "2026-08-17",
          driverName: "",
          vehicleType: "",
          route: "",
          km: 0,
          cost: 165,
          notes: "dodatek za niedzielę",
          status: "",
          invitationId: null,
          vehicleOwner: "unknown",
          isAdditional: true,
          reason: "",
        },
      ],
    },
  };

  const result = extractAutomaticLogisticsOrderResult([], [dedicatedInvoice]);
  assert.equal(result.included.length, 0);
  assert.equal(result.excluded.length, 1);
  assert.equal(result.excluded[0].plate, "KK8108N");
});
