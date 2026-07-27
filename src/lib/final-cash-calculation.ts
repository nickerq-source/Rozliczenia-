function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface FinalCashInput {
  profitBeforeTaxes: number;
  incomeTax: number;
  ownerHealthContribution: number;
  vatDue: number;
}

export interface FinalCashResult {
  afterIncomeTaxAndHealth: number;
  afterAllTaxes: number;
}

/**
 * Jedno źródło prawdy dla kwot końcowych.
 * Wzrost któregokolwiek zobowiązania zawsze obniża wynik końcowy o tę samą kwotę.
 */
export function calculateFinalCash(input: FinalCashInput): FinalCashResult {
  const incomeTax = Math.max(0, input.incomeTax);
  const health = Math.max(0, input.ownerHealthContribution);
  const vatDue = Math.max(0, input.vatDue);
  const afterIncomeTaxAndHealth = round2(
    input.profitBeforeTaxes - incomeTax - health
  );

  return {
    afterIncomeTaxAndHealth,
    afterAllTaxes: round2(afterIncomeTaxAndHealth - vatDue),
  };
}
