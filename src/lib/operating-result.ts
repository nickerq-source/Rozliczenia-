export interface OperatingResultInput {
  revenueGross: number;
  driverPayout: number;
  employeeCharges: number;
  fuel: number;
  otherCosts: number;
  leasing: number;
}

export interface OperatingResult {
  operatingCosts: number;
  cashBeforeTaxes: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * Jedno źródło prawdy dla gotówkowego wyniku operacyjnego.
 * Każdy koszt jest odejmowany dokładnie raz, a podatki firmy są odejmowane
 * dopiero w `final-cash-calculation.ts`.
 */
export function calculateOperatingResult(
  input: OperatingResultInput
): OperatingResult {
  const operatingCosts = round2(
    finite(input.driverPayout)
    + finite(input.employeeCharges)
    + finite(input.fuel)
    + finite(input.otherCosts)
    + finite(input.leasing)
  );

  return {
    operatingCosts,
    cashBeforeTaxes: round2(finite(input.revenueGross) - operatingCosts),
  };
}
