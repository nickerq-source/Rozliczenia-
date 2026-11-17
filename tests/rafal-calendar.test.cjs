/* eslint-disable @typescript-eslint/no-require-imports -- Synthetic calendar regression tests. */
require('./helpers/register-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyFleetCommand } = require('../src/lib/fleet-commands.ts');
const { fleetDayNet, rafalMonthCost } = require('../src/lib/fleet.ts');
const { calendarDraftConflicts, mergeCalendarDrafts, restoreCalendarDrafts } = require('../src/lib/rafal-calendar.ts');
const { getDniMiesiaca } = require('../src/lib/dates.ts');
const { podatkiMiesiaca } = require('../src/lib/tax.ts');
const { previewFixture } = require('./fixtures/admin-preview.ts');
const day = (date, courses = 2, extra = {}) => ({ date, status: 'praca', courses, ordersNet: null, leaveNet: null, note: '', ...extra });
let seq = 0;
const apply = (data, command) => applyFleetCommand(data, command, 'Test admin', `calendar-${++seq}`, '2026-11-17T16:00:00Z').data;

test('full month saves atomically with one audit event, without touching Zenia, invoices or other months', () => {
  const source = structuredClone(previewFixture);
  const days = getDniMiesiaca(11).map(date => day(date));
  assert.equal(days.length, 30);
  assert.equal(getDniMiesiaca(12).length, 31);
  const saved = apply(source, { kind: 'days', month: 11, days });
  assert.deepEqual(JSON.parse(JSON.stringify(saved)).miesiace[11].rafal.days, days);
  assert.deepEqual(saved.miesiace[11].dni, source.miesiace[11].dni);
  assert.deepEqual(saved.miesiace[11].faktury, source.miesiace[11].faktury);
  assert.deepEqual(saved.miesiace[6], source.miesiace[6]);
  assert.equal(source.miesiace[11].rafal, undefined);
  assert.equal(saved.fleetHistory.length, 1);
  const result = rafalMonthCost(11, saved.miesiace[11]);
  assert.equal(result.calculated, 5400);
  assert.equal(result.payrollNet, 3605.85);
  assert.equal(result.additionalPayout, 1794.15);
  assert.equal(result.payout, 5400);
  assert.equal(result.charges, 2184.43);
  assert.equal(result.total, 7584.43);
  assert.equal(result.taxCost, 5790.28);
  assert.deepEqual(podatkiMiesiaca(saved, 11).rafal, result);
});

test('invalid date, duplicates, bad amounts and closed month reject entire batch', () => {
  const source = structuredClone(previewFixture);
  const before = JSON.stringify(source);
  for (const days of [[], [day('2026-11-02'), day('2026-12-01')], [day('2026-11-31')], [day('2026-11-02'), day('2026-11-02')], [day('2026-11-02'), day('2026-11-03', -1)], [day('2026-11-02', 1, { ordersNet: 0.001 })], Array.from({ length: 32 }, () => day('2026-11-02'))]) {
    assert.throws(() => apply(source, { kind: 'days', month: 11, days }));
    assert.equal(JSON.stringify(source), before);
  }
  source.miesiace[11].zamkniety = { locked: true };
  assert.throws(() => apply(source, { kind: 'days', month: 11, days: [day('2026-11-02')] }), /zamknięty/);
});

test('batch update and undo affect only submitted dates, preserving unrelated days and settings', () => {
  let data = apply(structuredClone(previewFixture), { kind: 'day', month: 11, day: day('2026-11-02') });
  const first = structuredClone(data.miesiace[11].rafal.days[0]);
  data = apply(data, { kind: 'days', month: 11, days: [day('2026-11-02', 3), day('2026-11-03', 4)] });
  data.miesiace[11].rafal.days.push(day('2026-11-05'));
  data.miesiace[11].inneKoszty.push({ id: 'unrelated', nazwa: 'Service', koszt: 123 });
  const undone = apply(data, { kind: 'undo', id: data.fleetHistory.at(-1).id });
  assert.deepEqual(undone.miesiace[11].rafal.days, [first, day('2026-11-05')]);
  assert.equal(undone.miesiace[11].inneKoszty.at(-1).id, 'unrelated');
  assert.equal(undone.fleetHistory.at(-1).undoneBy, 'Test admin');
  data.miesiace[11].rafal.days[0].courses = 5;
  assert.throws(() => apply(data, { kind: 'undo', id: data.fleetHistory.at(-1).id }), /później/);
});

test('statuses preserve comments and amounts; missing leave or order amount stays incomplete', () => {
  const days = [day('2026-11-02'), day('2026-11-03', 3, { status: 'praca_zlecenia', ordersNet: 80.25 }), day('2026-11-04', 0, { status: 'urlop', leaveNet: 150.50, note: 'Paid leave' }), day('2026-11-05', 8, { status: 'postojowe' }), day('2026-11-06', 5, { status: 'wolne' })];
  assert.deepEqual(days.map(fleetDayNet), [180, 350.25, 150.50, 50, 0]);
  const saved = apply(structuredClone(previewFixture), { kind: 'days', month: 11, days });
  assert.equal(rafalMonthCost(11, saved.miesiace[11]).calculated, 730.75);
  assert.equal(rafalMonthCost(11, saved.miesiace[11]).additionalPayout, 0);
  const missing = apply(saved, { kind: 'days', month: 11, days: [day('2026-11-04', 0, { status: 'urlop' })] });
  assert.equal(rafalMonthCost(11, missing.miesiace[11]).incomplete, true);
});

test('draft recovery preserves only unsaved changes and refuses another month or corrupt data', () => {
  const base = day('2026-11-02');
  const drafts = { [base.date]: { base, value: { ...base, courses: 4 } }, '2026-11-03': { base: null, value: day('2026-11-03') } };
  assert.deepEqual(restoreCalendarDrafts(JSON.stringify(drafts), 11, [base]), drafts);
  assert.equal(mergeCalendarDrafts(drafts, [base, day('2026-11-05')]).length, 3);
  assert.deepEqual(calendarDraftConflicts(drafts, [base]), []);
  assert.deepEqual(calendarDraftConflicts(drafts, [{ ...base, courses: 7 }]), [base.date]);
  assert.deepEqual(calendarDraftConflicts(drafts, [base, day('2026-11-03', 8)]), ['2026-11-03']);
  assert.deepEqual(restoreCalendarDrafts(JSON.stringify(drafts), 11, mergeCalendarDrafts(drafts, [base])), {});
  assert.throws(() => restoreCalendarDrafts(JSON.stringify(drafts), 12, []));
  assert.throws(() => restoreCalendarDrafts('{', 11, []));
  assert.throws(() => restoreCalendarDrafts(JSON.stringify({ '2026-11-01': drafts[base.date] }), 11, []));
  drafts[base.date].value.courses = 101;
  assert.equal(restoreCalendarDrafts(JSON.stringify(drafts), 11, [base])[base.date].value.courses, 101);
});
