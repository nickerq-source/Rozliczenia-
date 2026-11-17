/* eslint-disable @typescript-eslint/no-require-imports -- Node regression tests. */
require('./helpers/register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { companySettlementTotals, companyTaxLiabilities } = require('../src/lib/company-settlement.ts');
const { podatkiMiesiaca, podatkiRoku, getUstawienia } = require('../src/lib/tax.ts');
const { obliczWynikMiesiaca, domyslneDaneMiesiaca } = require('../src/lib/business-logic.ts');
const { previewFixture } = require('./fixtures/admin-preview.ts');
const { rafalPayrollSettings } = require('../src/lib/fleet.ts');
const { applyFleetCommand } = require('../src/lib/fleet-commands.ts');
const cents = n => Math.round(n * 100);
function fixture(courses = 2) {
  const data = structuredClone(previewFixture);
  data.ustawienia = { pracownikOficjalnyEnabled: true, pracownikBruttoMies: 1255, invoiceAmountMode: 'brutto' };
  data.miesiace[11].rafal = { days: [{ date: '2026-11-03', status: 'praca', courses, ordersNet: null, leaveNet: null, note: '' }] };
  return data;
}
function settle(data, month = 11) {
  const tax = podatkiMiesiaca(data, month);
  const result = obliczWynikMiesiaca(month, data.miesiace[month] ?? domyslneDaneMiesiaca(month), getUstawienia(data));
  const totals = companySettlementTotals(tax, result);
  assert.equal(cents(totals.finalCash), cents(totals.revenueGross - totals.driverPayouts - totals.purchaseCosts - totals.taxLiabilities), 'cash subtracts both payouts, purchases and each liability exactly once');
  assert.equal(cents(result.kosztyOperacyjne), cents(totals.employmentCosts + totals.purchaseCosts));
  assert.equal(cents(tax.zyskPrzedPodatkami), cents(result.zysk));
  return { tax, result, totals };
}

test('company totals include both drivers, with cash payouts distinct from deductible payroll', () => {
  const { tax, totals } = settle(fixture());
  assert.equal(totals.driverPayouts, 3905.85);
  assert.equal(totals.employeeCharges, 2576.73);
  assert.equal(totals.employmentCosts, 6482.58);
  assert.equal(totals.taxableEmploymentCosts, 7437.58);
  assert.equal(cents(totals.taxLiabilities), cents(Math.max(0, tax.vatDoZaplaty) + tax.pitMiesiac + tax.zdrowotna + 392.30 + 2184.43));
  assert.notEqual(totals.employmentCosts, totals.taxableEmploymentCosts);
});

test('annual liabilities match monthly totals, including Rafal income tax and all contributions', () => {
  const data = fixture();
  for (const tax of podatkiRoku(data)) {
    const monthly = settle(data, tax.miesiac);
    assert.equal(companyTaxLiabilities(tax), monthly.totals.taxLiabilities);
    assert.equal(cents(companyTaxLiabilities(tax)), cents(Math.max(0, tax.vatDoZaplaty) + tax.pitMiesiac + tax.zdrowotna + tax.podatekDochodowyPracownika + tax.skladkaZdrowotnaPracownika + tax.pozostaleSkladkiZusPracownika + tax.rafal.charges));
  }
});

test('contract starts in November; earlier months stay isolated and empty months have no invented lease', () => {
  const data = fixture();
  const june = settle(data, 6);
  assert.equal(june.tax.rafal.charges, 0);
  assert.equal(june.totals.driverPayouts, 200);
  const december = settle(data, 12);
  assert.equal(december.totals.driverPayouts, 3605.85);
  assert.equal(december.totals.employeeCharges, 2184.43);
  assert.equal(december.totals.employmentCosts, 5790.28);
  assert.equal(december.totals.taxableEmploymentCosts, 5790.28);
  assert.equal(december.totals.purchaseCosts, 0);
  assert.equal(december.totals.revenueGross, 0);
  assert.equal(settle({ miesiace: {} }, 12).totals.employmentCosts, 5790.28);
  for (const value of Object.values(settle({ miesiace: {} }, 10).totals)) assert.equal(value, 0);
  data.miesiace[11].rafal.days[0].courses = 70;
  assert.deepEqual(settle(data, 6), june);
});

test('both drivers payout edits change company net cash without duplicating payroll taxes', () => {
  const data = fixture(50);
  const before = settle(data);
  data.miesiace[11].rafal.days[0].courses = 60;
  data.miesiace[11].dni['2026-11-02'].kolka = 4;
  const after = settle(data);
  assert.equal(cents(after.totals.driverPayouts - before.totals.driverPayouts), 100000);
  assert.equal(cents(after.totals.finalCash - before.totals.finalCash), -100000);
  assert.equal(after.totals.taxLiabilities, before.totals.taxLiabilities);
  assert.equal(after.totals.taxableEmploymentCosts, before.totals.taxableEmploymentCosts);
});

test('November and December fixed payroll reconciles across company totals even before any calendar entries', () => {
  for (const month of [11, 12]) {
    const data = { miesiace: { [month]: domyslneDaneMiesiaca(month) } };
    const before = settle(data, month);
    assert.equal(before.tax.rafal.payroll.employeeIncomeTax, 168);
    assert.equal(before.tax.rafal.payroll.gross, 4806);
    assert.equal(before.totals.driverPayouts, 3605.85);
    assert.equal(before.totals.employeeCharges, 2184.43);
    assert.equal(before.totals.taxableEmploymentCosts, 5790.28);
    assert.equal(before.result.leasing, 0, 'fixed Rafal payroll does not activate the legacy default lease');
    assert.equal(before.tax.kosztyPodatkowe, 5790.28);
    assert.equal(before.tax.vatNaliczony, 0);
    assert.equal(before.tax.zyskPrzedPodatkami, -5790.28);
    assert.equal(cents(before.totals.finalCash), -579028 - cents(before.tax.zdrowotna));
    for (const courses of [0, 20, 60, 90]) {
      const day = { date: `2026-${month}-03`, status: 'praca', courses, ordersNet: null, leaveNet: null, note: '' };
      const saved = applyFleetCommand(data, { kind: 'day', month, day }, 'Test admin', `fixed-${month}-${courses}`, '2026-11-17T12:00:00Z').data;
      const after = settle(saved, month);
      assert.equal(after.totals.employeeCharges, 2184.43);
      assert.equal(after.tax.kosztyPodatkowe, 5790.28);
      assert.equal(after.totals.driverPayouts, Math.max(3605.85, courses * 90));
      assert.equal(cents(after.totals.finalCash - before.totals.finalCash), cents(before.totals.driverPayouts - after.totals.driverPayouts));
      for (const field of ['pitMiesiac', 'zdrowotna', 'vatDoZaplaty']) assert.equal(after.tax[field], before.tax[field]);
    }
  }
});

test('approved fuel and purchase costs of either driver flow into VAT, income and cash', () => {
  for (const driverId of ['zenia', 'rafal']) {
    const data = fixture(); const before = settle(data);
    const expense = { id: 'extra', driverId, data: '2026-11-04', koszt: 123, amountMode: 'brutto', vatRate: '0.23', vatDeductible: true, vatDeductionPercent: 100, hasInvoice: true };
    data.miesiace[11].tankowanie.push({ ...expense, status: 'pending' });
    assert.deepEqual(settle(data), before, 'unapproved receipt cannot change tax');
    data.miesiace[11].tankowanie.at(-1).status = 'approved';
    data.miesiace[11].inneKoszty.push({ ...expense, id: 'service', nazwa: 'Service' });
    const after = settle(data);
    assert.equal(cents(after.totals.purchaseCosts - before.totals.purchaseCosts), 24600);
    assert.equal(cents(after.tax.vatNaliczony - before.tax.vatNaliczony), 4600);
    assert.equal(cents(after.tax.kosztyPodatkowe - before.tax.kosztyPodatkowe), 20000);
    assert.equal(cents(after.tax.pitMiesiac - before.tax.pitMiesiac), -2400);
    assert.ok(after.totals.finalCash < before.totals.finalCash);
  }
});

test('VAT carry is consumed only by the common tax engine, never a second time in liabilities', () => {
  const data = fixture();
  data.miesiace[6] = { ...domyslneDaneMiesiaca(6), faktury: [], leasing: 0, inneKoszty: [{ id: 'vat-credit', nazwa: 'Purchase', data: '2026-06-01', koszt: 12300, amountMode: 'brutto', vatRate: '0.23', vatDeductible: true, vatDeductionPercent: 100 }] };
  data.miesiace[11].faktury = [{ id: 'sale', label: 'Sale', kwota: 1230 }];
  data.miesiace[11].tankowanie = []; data.miesiace[11].inneKoszty = [];
  const { tax, totals } = settle(data);
  assert.equal(tax.vatNadwyzkaZPoprzednich, 2300);
  assert.equal(tax.vatNadwyzkaDoPrzeniesienia, 2070);
  assert.equal(Math.max(0, tax.vatDoZaplaty), 0);
  assert.equal(totals.taxLiabilities, 3009.27);
  assert.equal(totals.taxLiabilities, companyTaxLiabilities(podatkiRoku(data).find(t => t.miesiac === 11)));
  assert.ok(totals.finalCash < 0);
});

test('PIT-2 change recalculates remainder, payroll costs and company cash together across the net floor', () => {
  for (const [courses, payoutIncrease, cashIncrease] of [[2, 300, 0], [38, 185.85, 114.15], [60, 0, 300]]) {
    const data = fixture(courses);
    const settings = { ...rafalPayrollSettings(11, data.miesiace[11]), taxReduction: 0 };
    data.miesiace[11].rafal.payrollSettings = settings;
    const before = settle(data);
    const saved = applyFleetCommand(data, { kind: 'payrollSettings', month: 11, settings: { ...settings, taxReduction: 300 } }, 'Test admin', `pit2-${courses}`, '2026-11-17T12:00:00Z').data;
    const after = settle(JSON.parse(JSON.stringify(saved)));
    assert.equal(after.tax.rafal.payrollNet, 3605.85);
    assert.equal(after.tax.rafal.additionalPayout, Math.max(0, Math.round((courses * 90 - 3605.85) * 100) / 100));
    assert.equal(cents(after.totals.driverPayouts - before.totals.driverPayouts), cents(payoutIncrease));
    assert.equal(cents(after.totals.employeeCharges - before.totals.employeeCharges), -30000);
    assert.equal(cents(after.totals.employmentCosts), cents(before.totals.employmentCosts) - cents(cashIncrease));
    assert.equal(cents(after.totals.finalCash - before.totals.finalCash), cents(cashIncrease));
    for (const field of ['kosztyPodatkowe', 'pitMiesiac', 'zdrowotna', 'vatDoZaplaty', 'wynagrodzenieDoWyplaty', 'obciazeniaPracownika']) assert.equal(after.tax[field], before.tax[field], field);
    assert.equal(after.totals.taxableEmploymentCosts, before.totals.taxableEmploymentCosts);
    assert.deepEqual(settle(saved, 6), settle(data, 6));
    const undone = applyFleetCommand(saved, { kind: 'undo', id: saved.fleetHistory.at(-1).id }, 'Test admin', 'undo', '2026-11-17T12:01:00Z').data;
    assert.deepEqual(settle(undone), before);
  }
});
