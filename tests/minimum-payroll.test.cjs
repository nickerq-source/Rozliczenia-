/* eslint-disable @typescript-eslint/no-require-imports -- Node TS test harness. */
const test = require("node:test");
const assert = require("node:assert/strict");
require("./helpers/register-ts.cjs");
const { calculateMinimumPayroll2026, DEFAULT_MINIMUM_PAYROLL } = require("../src/lib/minimum-payroll.ts");
const calc = options => calculateMinimumPayroll2026({ ...DEFAULT_MINIMUM_PAYROLL, ...options });

test("2026 minimum salary contributions are rounded separately, never from a combined rate", () => {
  const p = calc();
  assert.equal(p.gross, 4806);
  assert.deepEqual(p.breakdown, {
    employeePension: 469.07, employeeDisability: 72.09, employeeSickness: 117.75,
    employerPension: 469.07, employerDisability: 312.39, employerAccident: 80.26,
    labourFund: 117.75, guaranteedBenefitsFund: 4.81,
  });
  assert.equal(p.employeeSocial, 658.91);
  assert.equal(p.healthBase, 4147.09);
  assert.equal(p.employeeHealth, 373.24);
  assert.equal(p.taxableBase, 3897);
  assert.equal(p.employerContributions, 984.28);
  assert.equal(p.employerCost, 5790.28);
});

test("PIT-2 changes only employee tax and net, not employer cost", () => {
  for (const [taxReduction, tax, net] of [[0, 468, 3305.85], [100, 368, 3405.85], [150, 318, 3455.85], [300, 168, 3605.85]]) {
    const p = calc({ taxReduction });
    assert.equal(p.employeeIncomeTax, tax);
    assert.equal(p.net, net);
    assert.equal(Math.round((p.net + p.employeeIncomeTax + p.employeeHealth + p.employeeSocial) * 100), 480600);
    assert.equal(p.employerCost, 5790.28);
  }
});

test("employee costs, higher withholding rate and employer-specific contributions are explicit options", () => {
  assert.equal(calc({ taxCosts: 300, taxReduction: 300 }).employeeIncomeTax, 162);
  assert.equal(calc({ taxCosts: 0, taxReduction: 300 }).employeeIncomeTax, 198);
  assert.equal(calc({ taxRate: 32 }).employeeIncomeTax, 1247);
  assert.equal(calc({ taxRate: 32 }).net, 2526.85);
  assert.equal(calc({ labourFund: false, guaranteedBenefitsFund: false }).employerContributions, 861.72);
  assert.equal(calc({ accidentRate: 2 }).employerContributions, 1000.14);
});
