import type { PDFImportDiagnosticRow } from "../../src/lib/types";
import { settleInvoiceRows } from "../../src/lib/invoice-settlement";
import { FLEET_DRIVERS } from "../../src/lib/driver-identity";
const row = (number: string, driverName: string, cost: number): PDFImportDiagnosticRow => ({
  orderNumber: number, driverName, date: "2026-11-03", vehicleType: "4/10", km: 15, cost,
  route: "Trasa testowa", notes: "Opis testowy", status: "Potwierdzone", invitationId: null,
  vehicleOwner: "unknown", reason: "", orderKind: "D",
});
export const fleetInvoiceFixture = settleInvoiceRows([
  row("10001/11/26CLKR2/D", "YEVHENII PITIANIN", 100.11),
  row("10002/11/26CLKR2/D", "Rafał Gustab", 200.22),
  row("10003/11/26CLKR2/D", "ARTUR SZADY", 300.33),
], { driverName: FLEET_DRIVERS[0], driverNames: [...FLEET_DRIVERS], vehicleType: "4/10", dateFrom: "2026-11-03", dateTo: "2026-11-03" });
