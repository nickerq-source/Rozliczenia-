export function normalizeMonthlyIncomeTaxRatePercent(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number"
    ? value
    : Number.parseFloat(String(value).trim().replace(",", "."));
  if (!Number.isFinite(parsed)) return null;
  return Math.min(100, Math.max(0, Math.round(parsed * 100) / 100));
}

/** Ręczna zaliczka miesiąca: dodatni dochód podatkowy razy wybrana stawka. */
export function calculateMonthlyIncomeTaxByRate(
  taxableIncome: number,
  ratePercent: unknown
): number | null {
  const normalizedRate = normalizeMonthlyIncomeTaxRatePercent(ratePercent);
  if (normalizedRate === null) return null;
  return Math.round(Math.max(0, taxableIncome) * normalizedRate) / 100;
}

export interface ResolveMonthlyIncomeTaxInput {
  taxableIncome: number;
  manualRatePercent: unknown;
  automaticCumulativeTax: number;
  previouslyCalculatedTax: number;
}

export interface ResolvedMonthlyIncomeTax {
  mode: "automatyczny" | "reczna_stawka";
  ratePercent: number | null;
  currentMonthTax: number;
  cumulativeTax: number;
}

export function resolveMonthlyIncomeTax({
  taxableIncome,
  manualRatePercent,
  automaticCumulativeTax,
  previouslyCalculatedTax,
}: ResolveMonthlyIncomeTaxInput): ResolvedMonthlyIncomeTax {
  const ratePercent = normalizeMonthlyIncomeTaxRatePercent(manualRatePercent);
  const manualTax = calculateMonthlyIncomeTaxByRate(taxableIncome, ratePercent);
  if (manualTax !== null) {
    return {
      mode: "reczna_stawka",
      ratePercent,
      currentMonthTax: manualTax,
      cumulativeTax: Math.round((previouslyCalculatedTax + manualTax) * 100) / 100,
    };
  }

  return {
    mode: "automatyczny",
    ratePercent: null,
    currentMonthTax: Math.max(
      0,
      Math.round((automaticCumulativeTax - previouslyCalculatedTax) * 100) / 100
    ),
    cumulativeTax: automaticCumulativeTax,
  };
}
