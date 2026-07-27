export interface VatSettlementInput {
  outputVat: number;
  deductibleInputVat: number;
  previousCarry: number;
}

export interface VatSettlementResult {
  currentBalance: number;
  previousCarry: number;
  payableOrCarry: number;
  vatPayable: number;
  nextCarry: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function positive(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Rozlicza miesięczny VAT przy założeniu, że nadwyżka jest przenoszona,
 * a nie zwracana na rachunek. `payableOrCarry` jest dodatnie przy zapłacie
 * i ujemne przy nadwyżce do kolejnego okresu.
 */
export function calculateVatSettlement(
  input: VatSettlementInput
): VatSettlementResult {
  const outputVat = positive(input.outputVat);
  const inputVat = positive(input.deductibleInputVat);
  const previousCarry = round2(positive(input.previousCarry));
  const currentBalance = round2(outputVat - inputVat);
  const payableOrCarry = round2(currentBalance - previousCarry);

  return {
    currentBalance,
    previousCarry,
    payableOrCarry,
    vatPayable: Math.max(0, payableOrCarry),
    nextCarry: Math.max(0, round2(-payableOrCarry)),
  };
}
