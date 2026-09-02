import test from "node:test";
import assert from "node:assert/strict";

import {
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
        notes: "PITIANIN",
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
        opis: "PITIANIN",
      },
      {
        data: "2026-08-07",
        plate: "KK2063A",
        kierowca: "Artur",
        wartoscNetto: 300.04,
        opis: "Odbiór kosza",
      },
    ]
  );
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
