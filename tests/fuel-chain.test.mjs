import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FUEL_VEHICLE,
  recalculateFuelChain,
} from "../src/lib/recalculate-fuel-chain.ts";

const vehicle = DEFAULT_FUEL_VEHICLE;

function entry(id, date, odometerKm, liters, gross, extra = {}) {
  return {
    id,
    data: date,
    expenseDate: date,
    odometerKm,
    litry: liters,
    koszt: gross,
    netAmount: Math.round((gross / 1.23) * 100) / 100,
    vatRate: "0.23",
    vehicleId: vehicle.id,
    isFullTank: true,
    status: "approved",
    includeInReports: true,
    createdAt: `${date}T08:00:00.000Z`,
    zalaczniki: [
      { id: `${id}-r`, typ: "dokument", attachmentKind: "receipt", nazwa: "r.jpg", mime: "image/jpeg", createdAt: date },
      { id: `${id}-o`, typ: "licznik", attachmentKind: "odometer", nazwa: "o.jpg", mime: "image/jpeg", createdAt: date },
    ],
    ...extra,
  };
}

function recalc(entries, overrides = {}) {
  return recalculateFuelChain(entries, {
    vehicles: [vehicle],
    defaultVehicleId: vehicle.id,
    ...overrides,
  });
}

const june = () => entry("june", "2026-06-20", 252945, 61.91, 357.22);
const july1 = () => entry("july-1", "2026-07-02", 253331, 88, 587.84);
const july2 = () => entry("july-2", "2026-07-09", 253829, 78.04, 551.74);

test("driver pending nie wchodzi do oficjalnego łańcucha", () => {
  const pending = entry("pending", "2026-07-02", 253331, 88, 587.84, { status: "pending" });
  assert.equal(recalc([june(), pending]).segments.length, 0);
  assert.equal(recalc([june(), pending], { includePending: true }).segments[0].distanceKm, 386);
});

test("admin approved zamyka odcinek", () => {
  assert.equal(recalc([june(), july1()]).segments[0].distanceKm, 386);
});

test("edycja przebiegu przelicza zmieniony i późniejszy wpis", () => {
  const changed = july1();
  changed.odometerKm = 253300;
  const result = recalc([june(), changed, july2()]);
  assert.deepEqual(result.segments.map((segment) => segment.distanceKm), [355, 529]);
});

test("edycja litrów przelicza spalanie", () => {
  const changed = july1();
  changed.litry = 80;
  assert.equal(recalc([june(), changed]).segments[0].consumptionLPer100Km, 20.73);
});

test("edycja daty i kolejności tablicy nie psuje łańcucha", () => {
  const result = recalc([july2(), june(), july1()]);
  assert.deepEqual(result.segments.map((segment) => segment.distanceKm), [386, 498]);
});

test("zmiana pojazdu rozdziela łańcuchy", () => {
  const other = { id: "other", name: "Inne", tankCapacityLiters: 80 };
  const moved = july1();
  moved.vehicleId = other.id;
  const result = recalculateFuelChain([june(), moved], { vehicles: [vehicle, other] });
  assert.equal(result.segments.length, 0);
});

test("usunięcie wcześniejszego wpisu łączy następny z anchorem", () => {
  assert.equal(recalc([june(), july2()]).segments[0].distanceKm, 884);
});

test("dodanie historycznego wpisu pomiędzy przelicza późniejsze odcinki", () => {
  const middle = entry("middle", "2026-07-05", 253500, 30, 210);
  assert.deepEqual(recalc([june(), july1(), july2(), middle]).segments.map((segment) => segment.distanceKm), [386, 169, 329]);
});

test("zatwierdzenie pending włącza wpis do łańcucha", () => {
  const pending = july1();
  pending.status = "pending";
  assert.equal(recalc([june(), pending]).segments.length, 0);
  pending.status = "approved";
  assert.equal(recalc([june(), pending]).segments.length, 1);
});

test("odrzucenie wpisu przelicza późniejszy względem wcześniejszego", () => {
  const rejected = july1();
  rejected.status = "rejected";
  assert.equal(recalc([june(), rejected, july2()]).segments[0].distanceKm, 884);
});

test("includeInReports false wyłącza wpis z oficjalnych metryk", () => {
  const excluded = july1();
  excluded.includeInReports = false;
  assert.equal(recalc([june(), excluded, july2()]).segments[0].distanceKm, 884);
});

test("tankowania częściowe zamykają jeden wspólny cykl", () => {
  const b = entry("b", "2026-07-02", 253100, 20, 140, { isFullTank: false });
  const c = entry("c", "2026-07-05", 253400, 30, 210, { isFullTank: false });
  const d = entry("d", "2026-07-09", 253829, 50, 350);
  const result = recalc([june(), b, c, d]);
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0].liters, 100);
  assert.deepEqual(result.segments[0].entryIds, ["b", "c", "d"]);
  assert.equal(result.entries.find((item) => item.id === "b").fuelConsumptionLPer100Km, undefined);
});

test("kilka pojazdów ma niezależne anchory", () => {
  const other = { id: "other", name: "Inne", tankCapacityLiters: 80 };
  const a = entry("a", "2026-06-20", 1000, 60, 360, { vehicleId: other.id });
  const b = entry("b", "2026-07-02", 1500, 50, 300, { vehicleId: other.id });
  const result = recalculateFuelChain([june(), july1(), a, b], { vehicles: [vehicle, other] });
  assert.deepEqual(result.segments.map((segment) => segment.distanceKm).sort((x, y) => x - y), [386, 500]);
});

test("brak vehicleId przy wielu pojazdach nie łączy wpisu automatycznie", () => {
  const other = { id: "other", name: "Inne", tankCapacityLiters: 80 };
  const missing = july1();
  delete missing.vehicleId;
  const result = recalculateFuelChain([june(), missing], { vehicles: [vehicle, other] });
  assert.deepEqual(result.unassignedEntryIds, ["july-1"]);
  assert.equal(result.segments.length, 0);
});

test("brak przebiegu nie tworzy cyklu i oznacza wpis", () => {
  const missing = july1();
  delete missing.odometerKm;
  const result = recalc([june(), missing]);
  assert.equal(result.segments.length, 0);
  assert.equal(result.entries.find((item) => item.id === "july-1").needsReview, true);
});

test("malejący przebieg według daty jest oznaczony do sprawdzenia", () => {
  const bad = entry("bad", "2026-07-10", 252900, 70, 480);
  const result = recalc([june(), bad]);
  assert.equal(result.entries.find((item) => item.id === "bad").fuelStatus, "invalid_odometer");
});

test("anchor czerwca daje oczekiwane statystyki lipca", () => {
  const result = recalc([june(), july1(), july2()]);
  assert.deepEqual(result.segments.map((segment) => segment.distanceKm), [386, 498]);
  const julySegments = result.segments.filter((segment) => segment.endDate.startsWith("2026-07"));
  const km = julySegments.reduce((sum, segment) => sum + segment.distanceKm, 0);
  const liters = julySegments.reduce((sum, segment) => sum + segment.liters, 0);
  const gross = julySegments.reduce((sum, segment) => sum + segment.grossAmount, 0);
  const net = julySegments.reduce((sum, segment) => sum + segment.netAmount, 0);
  assert.equal(km, 884);
  assert.equal(Math.round(liters * 100) / 100, 166.04);
  assert.equal(Math.round((liters / km) * 10000) / 100, 18.78);
  assert.equal(Math.round(gross * 100) / 100, 1139.58);
  assert.equal(Math.round(net * 100) / 100, 926.49);
  assert.equal(Math.round((gross - net) * 100) / 100, 213.09);
  assert.equal(Math.round((gross / km) * 100) / 100, 1.29);
  assert.equal(Math.round((net / km) * 100) / 100, 1.05);
  assert.equal(Math.round((gross / liters) * 100) / 100, 6.86);
  assert.equal(Math.round((net / liters) * 100) / 100, 5.58);
  const julyEntries = result.entries.filter((item) => item.expenseDate.startsWith("2026-07"));
  assert.equal(julyEntries.length, 2);
  assert.equal(
    Math.round((julyEntries.reduce((sum, item) => sum + item.fuelBeforeRefuelLiters, 0) / julyEntries.length) * 100) / 100,
    7.98
  );
  assert.equal(result.entries.find((item) => item.id === "july-2").kmSinceLastFuel, 498);
});
