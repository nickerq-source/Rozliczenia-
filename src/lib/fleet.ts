import type { DaneMiesiaca } from "./types";
import { sumMoney } from "./invoice-settlement";

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
}
export interface FleetHistoryEntry {
  id: string;
  at: string;
  actor: string;
  month: number;
  kind: "day" | "payroll" | "invoice";
  target: string;
  description: string;
  before: unknown;
  after: unknown;
  undoneAt?: string;
  undoneBy?: string;
}
export function fleetDayNet(day: FleetDay): number | null {
  if (day.status === "wolne") return 0;
  if (day.status === "postojowe") return 50;
  if (day.status === "urlop") return day.leaveNet;
  if (day.status === "praca_zlecenia" && day.ordersNet === null) return null;
  return sumMoney([day.courses * 90, day.status === "praca_zlecenia" ? day.ordersNet ?? 0 : 0]);
}
export function rafalMonthCost(month: Pick<DaneMiesiaca, "rafal">) {
  const days = month.rafal?.days ?? [];
  const payroll = month.rafal?.payroll;
  const calculated = sumMoney(days.map(day => fleetDayNet(day) ?? 0));
  const charges = payroll ? sumMoney([payroll.employeeIncomeTax, payroll.employeeHealth, payroll.employeeSocial, payroll.employerContributions, payroll.otherDeductions]) : 0;
  const payrollNet = payroll?.net ?? 0;
  // Payslip net is part of the accrued payout, not a cap or an extra payment.
  const additionalPayout = Math.max(0, sumMoney([calculated, -payrollNet]));
  const payout = sumMoney([payrollNet, additionalPayout]);
  return { calculated, payrollNet, additionalPayout, payout, charges, total: sumMoney([payout, charges]),
    taxCost: payroll?.deductibleThisMonth ? sumMoney([payroll.gross, payroll.employerContributions]) : 0,
    incomplete: days.some(day => fleetDayNet(day) === null) || (calculated > 0 && !payroll)
      || (!!payroll && days.length > 0 && sumMoney([payrollNet, -calculated]) > 0.01),
    active: days.length > 0 || !!payroll, payroll };
}
