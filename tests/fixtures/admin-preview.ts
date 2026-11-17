import type { WorkspaceData } from "../../src/lib/types";

// Synthetic amounts only; no customer invoices or production workspace contents.
export const previewFixture: WorkspaceData = {
  miesiace: {
    6: { faktury: [{ id: "sample-june", label: "Faktura 1", kwota: 8000 }],
      dni: { "2026-06-02": { data: "2026-06-02", kolka: 2, szkolenie: 0 } },
      tankowanie: [], inneKoszty: [], leasing: 0 },
    11: {
      faktury: [{ id: "sample-november", label: "Faktura 1", kwota: 12000, transferredToAlior: false }],
      dni: { "2026-11-02": { data: "2026-11-02", kolka: 3, szkolenie: 0 } },
      tankowanie: [{ id: "sample-fuel", data: "2026-11-02", koszt: 500, amountMode: "brutto", vatRate: "0.23", stationName: "Stacja testowa", status: "approved", litry: 70 }],
      inneKoszty: [{ id: "sample-cost", data: "2026-11-01", nazwa: "Serwis testowy", koszt: 300, amountMode: "brutto", vatRate: "0.23", paidBy: "Artur" }],
      leasing: 0,
      podatekDochodowyStawkaMiesieczna: 12,
    },
  },
  notatki: [{ id: "sample-note", tresc: "Notatka testowa", autor: "Administrator", miesiac: 11, dataUtworzenia: "2026-11-01T12:00:00Z" }],
};
