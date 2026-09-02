const round2 = (value: number) => Math.round(value * 100) / 100;

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Prowizja 5% jest liczona od końcowej gotówki firmy po wszystkich podatkach,
 * pomniejszonej wyłącznie o zlecenia Żeni, które dostały już prowizję 12%.
 * Ręczne zlecenia pozostałych aut nie wchodzą do wyniku firmy z faktur, więc
 * nie wolno odejmować ich od tej podstawy drugi raz.
 */
export function calculateLogisticsProfitShare(
  finalCashAfterAllTaxes: number,
  zeniOrdersNet: number,
  rate: number
): { base: number; commission: number } {
  const base = round2(
    Math.max(0, nonNegative(finalCashAfterAllTaxes) - nonNegative(zeniOrdersNet))
  );
  const commission = round2(base * nonNegative(rate));

  return { base, commission };
}
