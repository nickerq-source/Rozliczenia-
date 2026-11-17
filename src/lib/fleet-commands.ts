import type { FakturaWeek, MiesiącId, WorkspaceData } from "./types";
import type { FleetDay, FleetHistoryEntry, RafalPayroll } from "./fleet";
import { FLEET_DRIVERS, matchesInvoiceDriver } from "./driver-identity";
import { domyslneDaneMiesiaca } from "./business-logic";
import { findInvoiceImportConflict, invoiceSourceRows, recalculateInvoiceImport, saveInvoicePreview, type InvoicePreview } from "./invoice-import";
import { grossMoney, invoiceDate, moneyCents, sumMoney } from "./invoice-settlement";

export type FleetCommand =
  | { kind: "day"; month: MiesiącId; day: FleetDay }
  | { kind: "payroll"; month: MiesiącId; payroll: RafalPayroll }
  | { kind: "invoice"; month: MiesiącId; id?: string; preview: InvoicePreview; fileName: string; number: string | null }
  | { kind: "undo"; id: string };

export class FleetInputError extends Error {}
function ensure(condition: unknown, message: string): asserts condition { if (!condition) throw new FleetInputError(message); }
const text = (v: unknown, max = 1000): v is string => typeof v === "string" && v.length <= max;
const cash = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 10000000 && Math.abs(v * 100 - Math.round(v * 100)) < 0.000001;
const equal = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function validateFleetDay(day: FleetDay, month: number) {
  ensure(day && invoiceDate(day.date) && day.date.startsWith(`2026-${String(month).padStart(2, "0")}-`), "Data dnia musi należeć do wybranego miesiąca.");
  ensure(["praca", "praca_zlecenia", "urlop", "postojowe", "wolne"].includes(day.status), "Nieprawidłowy status dnia.");
  ensure(Number.isInteger(day.courses) && day.courses >= 0 && day.courses <= 100, "Liczba kursów musi wynosić od 0 do 100.");
  ensure((day.ordersNet === null || cash(day.ordersNet)) && (day.leaveNet === null || cash(day.leaveNet)) && text(day.note), "Sprawdź kwoty i komentarz dnia.");
}

export function validatePayroll(p: RafalPayroll) {
  ensure(p && [p.gross, p.net, p.employeeIncomeTax, p.employeeHealth, p.employeeSocial, p.employerContributions, p.otherDeductions].every(cash), "Wpisz nieujemne kwoty z listy płac, z dokładnością do grosza.");
  ensure(text(p.reference, 200) && p.reference.trim() && typeof p.deductibleThisMonth === "boolean", "Podaj numer lub opis listy płac.");
  ensure(Math.abs(moneyCents(p.gross) - moneyCents(sumMoney([p.net, p.employeeIncomeTax, p.employeeHealth, p.employeeSocial, p.otherDeductions]))) <= 1, "Brutto musi być równe netto + podatek + składki pracownika + pozostałe potrącenia. Składki pracodawcy wpisz osobno.");
}

export function prepareFleetInvoice(base: InvoicePreview): InvoicePreview {
  ensure(base && typeof base === "object", "Brak danych faktury.");
  const rows = invoiceSourceRows(base);
  ensure(Array.isArray(rows) && rows.length > 0 && rows.length <= 3000, "Brak pozycji źródłowych. Wgraj PDF ponownie.");
  for (const row of rows) ensure(row && text(row.orderNumber, 100) && text(row.driverName, 200) && text(row.vehicleType, 30) && Number.isFinite(row.cost) && Number.isFinite(row.km), "Nieprawidłowa pozycja faktury.");
  const from = base.invoiceImportDateFrom ?? base.filters?.dateFrom ?? base.zakresOd;
  const to = base.invoiceImportDateTo ?? base.filters?.dateTo ?? base.zakresDo;
  ensure(invoiceDate(from) && invoiceDate(to) && from! <= to!, "Sprawdź zakres dat faktury.");
  const overrides = base.recordOverrides ?? [];
  ensure(Array.isArray(overrides) && overrides.length <= rows.length, "Nieprawidłowa lista korekt.");
  for (const o of overrides) ensure(o && text(o.transportOrderId, 100) && typeof o.includeInSettlement === "boolean", "Nieprawidłowa korekta.");
  const additions = base.dodatkiReczne ?? [];
  ensure(Array.isArray(additions) && additions.length <= 200, "Za dużo dodatków faktury.");
  const filters = { driverName: FLEET_DRIVERS[0], driverNames: [...FLEET_DRIVERS], vehicleType: base.filters?.vehicleType || "4/10", dateFrom: from, dateTo: to };
  for (const a of additions) {
    ensure(a && text(a.id, 100) && text(a.driverName, 200) && matchesInvoiceDriver(a.driverName, filters) && invoiceDate(a.date) && a.date >= from! && a.date <= to!, "Dodatek musi mieć kierowcę i datę z zakresu faktury.");
    ensure(cash(a.netto) && cash(a.brutto) && Number.isFinite(a.vatRate) && a.vatRate >= 0 && a.vatRate <= 1 && typeof a.addToInvoice === "boolean", "Nieprawidłowa kwota dodatku.");
    ensure(moneyCents(a.brutto) === moneyCents(grossMoney(a.netto, a.vatRate)), "Kwota brutto dodatku nie zgadza się z netto i VAT.");
  }
  ensure(text(base.komentarz ?? "", 10000), "Komentarz jest za długi.");
  return recalculateInvoiceImport({ ...base, filters, sourceRows: rows }, { dateFrom: from, dateTo: to, overrides,
    manualDateRangeSelected: !!base.manualDateRangeSelected, comment: base.komentarz ?? "",
    additions: additions.map(a => ({ ...a, addToDriverSettlement: false, vatAmount: sumMoney([a.brutto, -a.netto]) })) });
}

function getTarget(data: WorkspaceData, entry: FleetHistoryEntry): unknown {
  const month = data.miesiace[entry.month as MiesiącId];
  if (entry.kind === "day") return month?.rafal?.days.find(day => day.date === entry.target) ?? null;
  if (entry.kind === "payroll") return month?.rafal?.payroll ?? null;
  return month?.faktury.find(invoice => invoice.id === entry.target) ?? null;
}
function setTarget(data: WorkspaceData, entry: FleetHistoryEntry, value: unknown) {
  value = structuredClone(value);
  const month = data.miesiace[entry.month as MiesiącId]!;
  if (entry.kind === "invoice") {
    const index = month.faktury.findIndex(invoice => invoice.id === entry.target);
    if (value === null) month.faktury = month.faktury.filter(invoice => invoice.id !== entry.target);
    else if (index >= 0) month.faktury[index] = value as FakturaWeek;
    else month.faktury.push(value as FakturaWeek);
  } else {
    month.rafal ??= { days: [] };
    if (entry.kind === "payroll") {
      if (value === null) delete month.rafal.payroll;
      else month.rafal.payroll = value as RafalPayroll;
    } else month.rafal.days = [...month.rafal.days.filter(day => day.date !== entry.target), ...(value === null ? [] : [value as FleetDay])].sort((a, b) => a.date.localeCompare(b.date));
  }
}

/** A targeted undo never restores the entire workspace or another driver's days. */
export function applyFleetCommand(source: WorkspaceData, input: FleetCommand, actor: string, id: string, at: string) {
  ensure(input && typeof input === "object", "Nieprawidłowe żądanie.");
  const data = structuredClone(source);
  data.fleetHistory ??= [];
  if (input.kind === "undo") {
    const last = data.fleetHistory.findLast(entry => !entry.undoneAt);
    ensure(last && last.id === input.id, "Można cofnąć tylko ostatnią niecofniętą zmianę.");
    ensure(!data.miesiace[last.month as MiesiącId]?.zamkniety?.locked, "Miesiąc jest zamknięty.");
    ensure(equal(getTarget(data, last), last.after), "Ta pozycja została później zmieniona. Cofnięcie zablokowane, aby nie utracić danych.");
    setTarget(data, last, last.before);
    last.undoneAt = at;
    last.undoneBy = actor;
    return { data, description: `Cofnięto: ${last.description}` };
  }
  ensure([6, 7, 8, 9, 10, 11, 12].includes(input.month), "Nieprawidłowy miesiąc.");
  const month = data.miesiace[input.month] ??= { ...domyslneDaneMiesiaca(input.month), leasing: 0 };
  ensure(!month.zamkniety?.locked, "Miesiąc jest zamknięty. Odblokuj go w ustawieniach.");
  let target: string;
  let value: unknown;
  let description: string;
  if (input.kind === "day") {
    validateFleetDay(input.day, input.month);
    target = input.day.date; value = input.day; description = `Rafał: dzień ${target}`;
  } else if (input.kind === "payroll") {
    validatePayroll(input.payroll);
    target = "payroll"; value = input.payroll; description = `Rafał: lista płac za miesiąc ${input.month}`;
  } else if (input.kind === "invoice") {
    ensure(text(input.fileName, 250) && (input.number === null || text(input.number, 100)), "Nieprawidłowy dokument.");
    const preview = prepareFleetInvoice(input.preview);
    ensure(preview.includedRows?.length || preview.dodatkiReczne?.some(a => a.addToInvoice), "Brak zaakceptowanych pozycji faktury.");
    ensure(!preview.reviewRows?.length, "Najpierw popraw lub wyklucz pozycje wymagające sprawdzenia.");
    const existing = input.id ? month.faktury.find(f => f.id === input.id) : undefined;
    ensure(!input.id || existing, "Nie znaleziono faktury do aktualizacji.");
    for (const [key, other] of Object.entries(data.miesiace)) {
      const duplicate = findInvoiceImportConflict(other!.faktury, input.number, preview, Number(key) === input.month ? input.id : undefined);
      ensure(!duplicate, `Te pozycje są już zapisane: ${duplicate?.label}, miesiąc ${key}. Otwórz istniejącą fakturę zamiast dodawać kopię.`);
    }
    target = existing?.id ?? `fleet-${id}`;
    value = { ...existing, id: target, label: `Faktura ${preview.zakresOd} – ${preview.zakresDo}`, kwota: preview.brutto, amountMode: "brutto", vatRate: preview.vatRate,
      rodzaj: "standardowa", customRange: { od: preview.zakresOd, do: preview.zakresDo }, pdfImport: saveInvoicePreview(preview, input.fileName, input.number) };
    description = `Faktura ${input.number ?? input.fileName}: podział Żenia / Rafał`;
  } else throw new FleetInputError("Nieznana operacja.");
  const entry: FleetHistoryEntry = { id, at, actor, month: input.month, kind: input.kind, target, description, before: null, after: value };
  entry.before = structuredClone(getTarget(data, entry));
  if (equal(entry.before, entry.after)) return { data: source, description: "Bez zmian" };
  setTarget(data, entry, value);
  data.fleetHistory.push(entry);
  return { data, description };
}
