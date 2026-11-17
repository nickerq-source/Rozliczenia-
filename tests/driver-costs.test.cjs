/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner. */
require('./helpers/register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { driverMonth, updateDriverMonth, assignDriverVehicle, driverVehicleHistory, vehicleMonths } = require('../src/lib/driver-costs.ts');
const { readAdminLocation, adminSearch, switchAdminDriver, DRIVER_VIEWS } = require('../src/lib/admin-navigation.ts');
const { domyslneDaneMiesiaca, obliczWynikMiesiaca, obliczKosztLeasingu, obliczLeasingLegacy } = require('../src/lib/business-logic.ts');
const { getUstawienia, podatkiMiesiaca } = require('../src/lib/tax.ts');
const { buildFuelStats } = require('../src/lib/fuel-stats.ts');
const vehicles = [{ id: 'iveco', name: 'Old car', tankCapacityLiters: 91 }, { id: 'rafal-car', name: 'New car', tankCapacityLiters: 100, driverId: 'rafal' }];
function fixture() {
  return { ...domyslneDaneMiesiaca(11), leasing: 2300,
    tankowanie: [{ id: 'z-fuel', data: '2026-11-02', koszt: 500, vehicleId: 'iveco' }, { id: 'r-fuel', data: '2026-11-02', koszt: 700, vehicleId: 'rafal-car' }],
    inneKoszty: [{ id: 'z-cost', data: '', nazwa: 'Old cost', koszt: 100 }, { id: 'r-cost', data: '', nazwa: 'New cost', koszt: 200, driverId: 'rafal' }],
    rafal: { days: [{ date: '2026-11-03', status: 'praca', courses: 2, ordersNet: null, leaveNet: null, note: '' }] },
  };
}
test('entry screen has two areas; deep links and browser history serialize without mixing driver and company', () => {
  assert.equal(readAdminLocation('').area, 'start');
  const next = { area: 'kierowcy', driver: 'rafal', view: 'tankowanie', tab: 'podsumowanie', month: 11 };
  assert.deepEqual(readAdminLocation(adminSearch(next)), next);
  assert.equal(readAdminLocation('?zakladka=koszty&miesiac=11').area, 'firma');
  assert.equal(readAdminLocation('?zakladka=koszty&miesiac=11&zgloszenie=test').driver, 'zenia');
  assert.equal(readAdminLocation('?menu=bad&kierowca=bad').area, 'start');
});
test('old records remain Zenia; explicit ownership and vehicle split select Rafal', () => {
  const month = fixture(); const snapshot = JSON.stringify(month);
  assert.deepEqual(driverMonth(month, 'zenia', vehicles).tankowanie.map(t => t.id), ['z-fuel']);
  const rafal = driverMonth(month, 'rafal', vehicles);
  assert.deepEqual(rafal.tankowanie.map(t => t.id), ['r-fuel']);
  assert.deepEqual(rafal.inneKoszty.map(t => t.id), ['r-cost']);
  assert.equal(rafal.leasing, 0);
  assert.equal(JSON.stringify(month), snapshot);
});

test('driver switch keeps month and section, with a payroll fallback for Rafal-only contract settings', () => {
  for (const month of [6, 11, 12]) {
    for (const [view] of DRIVER_VIEWS) {
      const current = { area: 'kierowcy', driver: 'rafal', view, tab: 'zarobek', month };
      const snapshot = structuredClone(current);
      const switched = switchAdminDriver(current, 'zenia');
      assert.deepEqual(current, snapshot);
      assert.equal(switched.month, month);
      assert.equal(switched.driver, 'zenia');
      assert.equal(switched.tab, 'zarobek');
      assert.equal(switched.view, view === 'umowa' ? 'wyplata' : view);
      assert.deepEqual(readAdminLocation(adminSearch(switched)), { ...switched, tab: 'podsumowanie' });
      assert.deepEqual(switchAdminDriver(switched, 'rafal'), { ...current, view: switched.view });
    }
  }
});
test('scoped update, insertion and removal preserve every other driver field and row', () => {
  const before = fixture();
  const after = updateDriverMonth(before, 'rafal', vehicles, m => ({ ...m, dni: {}, leasing: 9999, rafal: undefined,
    tankowanie: [{ id: 'r-new', data: '', koszt: 80 }], inneKoszty: m.inneKoszty.map(c => ({ ...c, koszt: 333 })) }), 'rafal-car');
  assert.deepEqual(after.tankowanie[0], before.tankowanie[0]);
  assert.deepEqual(after.inneKoszty[0], before.inneKoszty[0]);
  assert.equal(after.tankowanie[1].vehicleId, 'rafal-car');
  assert.equal(after.tankowanie[1].driverId, 'rafal');
  assert.equal(after.inneKoszty[1].koszt, 333);
  assert.deepEqual(after.dni, before.dni); assert.deepEqual(after.rafal, before.rafal); assert.equal(after.leasing, before.leasing);
});
test('editing old payroll does not overwrite Rafal payroll or his expenses', () => {
  const before = fixture(); const day = { kolka: 2, dayType: 'praca' };
  const after = updateDriverMonth(before, 'zenia', vehicles, m => ({ ...m, dni: { ...m.dni, '2026-11-02': day }, inneKoszty: [] }));
  assert.deepEqual(after.dni['2026-11-02'], day); assert.deepEqual(after.rafal, before.rafal);
  assert.deepEqual(after.inneKoszty, [before.inneKoszty[1]]);
});
test('driver totals reconcile to company costs exactly once', () => {
  const month = fixture(); const settings = getUstawienia({ miesiace: { 11: month } });
  const total = obliczWynikMiesiaca(11, month, settings);
  const sum = ['zenia', 'rafal'].reduce((sum, driver) => {
    const result = obliczWynikMiesiaca(11, driverMonth(month, driver, vehicles), settings);
    return sum + (driver === 'rafal' ? result.rafal.total : result.wynagrodzenieDoWyplaty + result.obciazeniaPracownika) + result.paliwo + result.inne + result.leasing;
  }, 0);
  assert.equal(Math.round(sum * 100), Math.round(total.kosztyOperacyjne * 100));
});
test('adding second vehicle pins old default and cannot relabel historical ownership', () => {
  const month = fixture(); month.tankowanie = [{ id: 'old', data: '', koszt: 123 }];
  const original = { miesiace: { 11: month }, vehicles: [vehicles[0]] };
  const added = assignDriverVehicle(original, vehicles[1]);
  assert.equal(added.miesiace[11].tankowanie[0].vehicleId, 'iveco');
  assert.equal(added.miesiace[11].tankowanie[0].driverId, 'zenia');
  const reassigned = assignDriverVehicle(added, { ...vehicles[0], driverId: 'rafal' });
  assert.equal(driverMonth(reassigned.miesiace[11], 'zenia', reassigned.vehicles).tankowanie.length, 1);
  assert.equal(driverMonth(reassigned.miesiace[11], 'rafal', reassigned.vehicles).tankowanie.length, 0);
  assert.deepEqual(driverVehicleHistory(reassigned, 'zenia').map(v => v.id), ['iveco']);
});
test('Rafal lease never replaces Zenia legacy lease in company costs or income tax', () => {
  const month = fixture();
  const originalTax = podatkiMiesiaca({ miesiace: { 11: month } }, 11);
  month.inneKoszty.push({ id: 'r-lease', data: '', nazwa: 'Lease', koszt: 1230, kategoria: 'leasing', driverId: 'rafal', vatRate: '0.23' });
  assert.equal(obliczKosztLeasingu(month), 3530);
  assert.equal(obliczLeasingLegacy(month), 2300);
  const nextTax = podatkiMiesiaca({ miesiace: { 11: month } }, 11);
  assert.equal(Math.round((nextTax.kosztyPodatkowe - originalTax.kosztyPodatkowe) * 100), 100000);
  assert.equal(Math.round((nextTax.vatNaliczony - originalTax.vatNaliczony) * 100), 23000);
  const settings = getUstawienia({ miesiace: { 11: month } });
  assert.equal(obliczWynikMiesiaca(11, month, settings).leasing, 3530);
  assert.equal(obliczKosztLeasingu(driverMonth(month, 'zenia', vehicles)) + obliczKosztLeasingu(driverMonth(month, 'rafal', vehicles)), 3530);
  month.inneKoszty.push({ id: 'z-lease', data: '', nazwa: 'Lease', koszt: 2400, kategoria: 'leasing', driverId: 'zenia' });
  assert.equal(obliczKosztLeasingu(month), 3630); assert.equal(obliczLeasingLegacy(month), 0);
});
test('vehicle statistics use that vehicle across month boundaries, never another odometer', () => {
  const fuel = (id, vehicleId, date, km, liters) => ({ id, vehicleId, data: date, koszt: liters * 6, litry: liters, odometerKm: km, isFullTank: true, status: 'approved' });
  const data = { vehicles, miesiace: { 10: { ...domyslneDaneMiesiaca(10), tankowanie: [fuel('a', 'rafal-car', '2026-10-30', 1000, 50)] },
    11: { ...fixture(), tankowanie: [fuel('b', 'rafal-car', '2026-11-02', 1200, 30), fuel('c', 'iveco', '2026-11-02', 500000, 80)] } } };
  const scoped = vehicleMonths(data, 'rafal-car');
  const stats = buildFuelStats(scoped[11], getUstawienia(data), { allMonths: scoped, targetMonth: 11, vehicles: [vehicles[1]] });
  assert.equal(stats.rows.length, 1); assert.equal(stats.rows[0].kmSinceLastFuel, 200);
  assert.equal(stats.summary.brutto, 180);
});
