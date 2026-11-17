import type { DaneMiesiaca } from "./types";
import { sumMoney } from "./invoice-settlement";
import { calculateMinimumPayroll2026, DEFAULT_MINIMUM_PAYROLL, type MinimumPayrollOptions } from "./minimum-payroll";

export { FLEET_DRIVERS, fleetDriverKey } from "./driver-identity";
export interface FleetDay {
  date: string;
  status: "praca" | "praca_zlecenia" | "urlop" | "postojowe" | "wolne";
  courses: number;
  ordersNet: number | null;
  leaveNet: number | null;
  note: string;
}
export interface RafalPayroll {
  gross: number;
  net: number;
  employeeIncomeTax: number;
  employeeHealth: number;
  employeeSocial: number;
  employerContributions: number;
  otherDeductions: number;
  deductibleThisMonth: boolean;
  reference: string;
}
export interface RafalMonth {
  days: FleetDay[];
  payroll?: RafalPayroll;
  payrollSettings?: RafalPayrollSettings;
}
export interface RafalPayrollSettings extends MinimumPayrollOptions {
  mode: "minimum" | "manual";
  enabled: boolean;
  deductibleThisMonth: boolean;
}
export interface FleetHistoryEntry {
  id: string;
  at: string;
  actor: string;
  month: number;
  kind: "day" | "days" | "payroll" | "payrollSettings" | "invoice";
  target: string;
  description: string;
  before: unknown;
  after: unknown;
  undoneAt?: string;
  undoneBy?: string;
}
export const RAFAL_KOLKO = 90;
export const RAFAL_POSTOJOWE = 50;

export function fleetDayNet(day: FleetDay): number | null {
  if (day.status === "wolne") return 0;
  if (day.status === "postojowe") return RAFAL_POSTOJOWE;
  if (day.status === "urlop") return day.leaveNet;
  if (day.status === "praca_zlecenia" && day.ordersNet === null) return null;
  return sumMoney([day.courses * RAFAL_KOLKO, day.status === "praca_zlecenia" ? day.ordersNet ?? 0 : 0]);
}
export function rafalPayrollSettings(monthId: number, month: Pick<DaneMiesiaca, "rafal">): RafalPayrollSettings {
  return month.rafal?.payrollSettings ?? {
    ...DEFAULT_MINIMUM_PAYROLL,
    taxReduction: 300,
    mode: month.rafal?.payroll ? "manual" : "minimum",
    // The confirmed contract starts in November of the app's 2026 period, not on the first calendar entry.
    enabled: !!month.rafal?.payroll || (monthId >= 11 && monthId <= 12),
    deductibleThisMonth: true,
  };
}

export function rafalMonthCost(monthId: number, month: Pick<DaneMiesiaca, "rafal">) {
  const days = month.rafal?.days ?? [];
  const settings = rafalPayrollSettings(monthId, month);
  const minimumCalculation = settings.mode === "minimum" ? calculateMinimumPayroll2026(settings) : null;
  const payroll: RafalPayroll | undefined = !settings.enabled ? undefined
    : minimumCalculation ? { ...minimumCalculation, deductibleThisMonth: settings.deductibleThisMonth }
    : month.rafal?.payroll;
  const calculated = sumMoney(days.map(day => fleetDayNet(day) ?? 0));
  const charges = payroll ? sumMoney([payroll.employeeIncomeTax, payroll.employeeHealth, payroll.employeeSocial, payroll.employerContributions, payroll.otherDeductions]) : 0;
  const payrollNet = payroll?.net ?? 0;
  // Payslip net is part of the accrued payout, not a cap or an extra payment.
  const additionalPayout = Math.max(0, sumMoney([calculated, -payrollNet]));
  const payout = sumMoney([payrollNet, additionalPayout]);
  return { calculated, payrollNet, additionalPayout, payout, charges, settings, minimumCalculation,
    estimated: settings.enabled && settings.mode === "minimum", total: sumMoney([payout, charges]),
    taxCost: payroll?.deductibleThisMonth ? sumMoney([payroll.gross, payroll.employerContributions]) : 0,
    incomplete: days.some(day => fleetDayNet(day) === null) || (settings.enabled && !payroll)
      || (settings.mode === "manual" && !!payroll && days.length > 0 && sumMoney([payrollNet, -calculated]) > 0.01),
    active: days.length > 0 || !!payroll, payroll };
}
