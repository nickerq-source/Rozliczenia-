// Full-time, full-month estimate only. Sources and exclusions: docs/FLEET_LIVE.md.
export const MINIMUM_GROSS_2026 = 4806;

export interface MinimumPayrollOptions {
  taxReduction: 0 | 100 | 150 | 300;
  taxCosts: 0 | 250 | 300;
  taxRate: 12 | 32;
  accidentRate: number;
  labourFund: boolean;
  guaranteedBenefitsFund: boolean;
}

export const DEFAULT_MINIMUM_PAYROLL: Readonly<MinimumPayrollOptions> = {
  taxReduction: 0,
  taxCosts: 250,
  taxRate: 12,
  accidentRate: 1.67,
  labourFund: true,
  guaranteedBenefitsFund: true,
};

export function calculateMinimumPayroll2026(options: MinimumPayrollOptions = DEFAULT_MINIMUM_PAYROLL) {
  const gross = MINIMUM_GROSS_2026 * 100;
  const contribution = (basisPoints: number) => Math.round(gross * basisPoints / 10000);
  const employeePension = contribution(976);
  const employeeDisability = contribution(150);
  const employeeSickness = contribution(245);
  const employeeSocial = employeePension + employeeDisability + employeeSickness;
  const healthBase = gross - employeeSocial;
  const employeeHealth = Math.round(healthBase * 9 / 100);
  // Both the taxable base and the final advance are rounded to whole PLN.
  const taxableBase = Math.max(0, Math.round((healthBase - options.taxCosts * 100) / 100));
  const employeeIncomeTax = Math.max(0, Math.round(taxableBase * options.taxRate / 100 - options.taxReduction)) * 100;
  const employerPension = contribution(976);
  const employerDisability = contribution(650);
  const employerAccident = contribution(Math.round(options.accidentRate * 100));
  const labourFund = options.labourFund ? contribution(245) : 0;
  const guaranteedBenefitsFund = options.guaranteedBenefitsFund ? contribution(10) : 0;
  const employerContributions = employerPension + employerDisability + employerAccident + labourFund + guaranteedBenefitsFund;
  return {
    gross: gross / 100,
    net: (gross - employeeSocial - employeeHealth - employeeIncomeTax) / 100,
    employeeIncomeTax: employeeIncomeTax / 100,
    employeeHealth: employeeHealth / 100,
    employeeSocial: employeeSocial / 100,
    employerContributions: employerContributions / 100,
    otherDeductions: 0,
    reference: "Minimum 2026",
    taxableBase,
    healthBase: healthBase / 100,
    employerCost: (gross + employerContributions) / 100,
    breakdown: {
      employeePension: employeePension / 100, employeeDisability: employeeDisability / 100,
      employeeSickness: employeeSickness / 100, employerPension: employerPension / 100,
      employerDisability: employerDisability / 100, employerAccident: employerAccident / 100,
      labourFund: labourFund / 100, guaranteedBenefitsFund: guaranteedBenefitsFund / 100,
    },
  };
}
