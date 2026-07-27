export interface ScaleTaxContext {
  incomeTaxScope: "company_division" | "standalone";
  taxFreeAmount: number;
  firstTaxThreshold: number;
  firstTaxRate: number;
  secondTaxRate: number;
  taxReducingAmount: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Liczy podatek na skali dla wyniku narastającego.
 * Moduł będący częścią tej samej firmy nie otrzymuje osobnej kwoty wolnej.
 */
export function calculateScaleTaxYtd(
  incomeYtd: number,
  context: ScaleTaxContext
): number {
  if (context.incomeTaxScope === "company_division") {
    if (incomeYtd <= 0) return 0;
    if (incomeYtd <= context.firstTaxThreshold) {
      return round2(incomeYtd * context.firstTaxRate);
    }
    const taxToThreshold =
      context.firstTaxThreshold * context.firstTaxRate;
    return round2(
      taxToThreshold
      + (incomeYtd - context.firstTaxThreshold) * context.secondTaxRate
    );
  }
  if (incomeYtd <= context.taxFreeAmount) return 0;
  if (incomeYtd <= context.firstTaxThreshold) {
    return Math.max(
      0,
      round2(incomeYtd * context.firstTaxRate - context.taxReducingAmount)
    );
  }
  const taxToThreshold =
    context.firstTaxThreshold * context.firstTaxRate
    - context.taxReducingAmount;
  return Math.max(
    0,
    round2(
      taxToThreshold
      + (incomeYtd - context.firstTaxThreshold) * context.secondTaxRate
    )
  );
}
