import type {
  FuelVehicleConfig,
  MiesiącId,
  VatRate,
  WorkspaceData,
  WpisTankowania,
} from "./types";
import type { FuelReviewStatus } from "./fuel-calculations";

const FUEL_ACCOUNTING_MONTHS: MiesiącId[] = [6, 7, 8, 9, 10, 11, 12];

export const DEFAULT_FUEL_VEHICLE: FuelVehicleConfig = {
  id: "iveco",
  name: "Iveco",
  tankCapacityLiters: 91,
  active: true,
};

export interface FuelChainSegment {
  vehicleId: string;
  vehicleName: string;
  startEntryId: string;
  endEntryId: string;
  entryIds: string[];
  startDate: string;
  endDate: string;
  startOdometerKm: number;
  endOdometerKm: number;
  distanceKm: number;
  liters: number;
  grossAmount: number;
  netAmount: number;
  vatAmount: number;
  consumptionLPer100Km: number;
  costPerKmGross: number;
  costPerKmNet: number;
}

export interface FuelChainOptions {
  vehicles: FuelVehicleConfig[];
  defaultVehicleId?: string;
  includePending?: boolean;
}

export interface FuelChainResult {
  entries: WpisTankowania[];
  segments: FuelChainSegment[];
  unassignedEntryIds: string[];
}

export interface WorkspaceFuelRecalculation {
  data: WorkspaceData;
  result: FuelChainResult;
}

type IssueState = {
  statuses: FuelReviewStatus[];
  reasons: string[];
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

function numberOrZero(value: unknown): number {
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

function entryDate(entry: WpisTankowania): string {
  return entry.expenseDate || entry.data || "9999-12-31";
}

function timestamp(entry: WpisTankowania): string {
  return entry.createdAt || `${entryDate(entry)}T00:00:00.000Z`;
}

function numericVatRate(rate: VatRate | undefined): number {
  if (!rate || rate === "zw" || rate === "np") return 0;
  return numberOrZero(rate);
}

export function fuelNetAmount(entry: WpisTankowania): number {
  const explicitNet = numberOrZero(entry.netAmount);
  if (explicitNet > 0) return round2(explicitNet);
  const gross = numberOrZero(entry.koszt);
  const explicitVat = numberOrZero(entry.vatAmount);
  if (gross > 0 && explicitVat > 0 && explicitVat < gross) return round2(gross - explicitVat);
  const rate = numericVatRate(entry.vatRate);
  return gross > 0 ? round2(gross / (1 + rate)) : 0;
}

function isOfficialEntry(entry: WpisTankowania, includePending: boolean): boolean {
  const status = entry.status ?? "approved";
  if (status === "rejected") return false;
  if (status === "pending" && !includePending) return false;
  return entry.includeInReports ?? true;
}

function statusPriority(statuses: FuelReviewStatus[]): FuelReviewStatus {
  const priority: FuelReviewStatus[] = [
    "invalid_odometer",
    "suspicious_liters",
    "vat_review",
    "uncertain_ai",
    "missing_receipt_photo",
    "missing_odometer_photo",
    "no_previous_refuel",
    "needs_review",
  ];
  return priority.find((status) => statuses.includes(status)) ?? "ok";
}

function addIssue(
  issues: Map<string, IssueState>,
  entryId: string,
  status: FuelReviewStatus,
  reason: string
) {
  const current = issues.get(entryId) ?? { statuses: [], reasons: [] };
  current.statuses.push(status);
  current.reasons.push(reason);
  issues.set(entryId, current);
}

function hasAttachment(entry: WpisTankowania, kind: "receipt" | "odometer"): boolean {
  return (entry.zalaczniki ?? []).some((attachment) => {
    if (kind === "receipt") {
      return attachment.attachmentKind === "receipt" || attachment.typ === "dokument";
    }
    return (
      attachment.attachmentKind === "odometer" ||
      attachment.attachmentKind === "tachograph" ||
      attachment.typ === "licznik"
    );
  });
}

function compareFuelEntries(a: WpisTankowania, b: WpisTankowania): number {
  const aOdometer = numberOrZero(a.odometerKm);
  const bOdometer = numberOrZero(b.odometerKm);
  if (aOdometer > 0 && bOdometer > 0 && aOdometer !== bOdometer) return aOdometer - bOdometer;
  if (aOdometer > 0 && bOdometer <= 0) return -1;
  if (aOdometer <= 0 && bOdometer > 0) return 1;
  const dateCompare = entryDate(a).localeCompare(entryDate(b));
  if (dateCompare !== 0) return dateCompare;
  return timestamp(a).localeCompare(timestamp(b));
}

export function getFuelVehicles(data: Pick<WorkspaceData, "vehicles">): FuelVehicleConfig[] {
  const configured = (data.vehicles ?? []).filter(
    (vehicle) =>
      vehicle.id.trim().length > 0 &&
      vehicle.name.trim().length > 0 &&
      Number.isFinite(vehicle.tankCapacityLiters) &&
      vehicle.tankCapacityLiters > 0
  );
  return configured.length > 0 ? configured : [DEFAULT_FUEL_VEHICLE];
}

export function recalculateFuelChain(
  sourceEntries: WpisTankowania[],
  options: FuelChainOptions
): FuelChainResult {
  const vehicles = options.vehicles.filter((vehicle) => vehicle.active !== false);
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const defaultVehicleId =
    options.defaultVehicleId && vehicleById.has(options.defaultVehicleId)
      ? options.defaultVehicleId
      : vehicles.length === 1
      ? vehicles[0].id
      : undefined;
  const includePending = options.includePending ?? false;
  const issues = new Map<string, IssueState>();
  const unassignedEntryIds: string[] = [];

  const entries = sourceEntries.map<WpisTankowania>((entry) => {
    const vehicleId = entry.vehicleId?.trim() || defaultVehicleId;
    const next: WpisTankowania = {
      ...entry,
      vehicleId,
      isFullTank: entry.isFullTank ?? true,
      previousOdometerKm: undefined,
      kmSinceLastFuel: undefined,
      fuelBeforeRefuelLiters: undefined,
      costPerKmGross: undefined,
      costPerKmNet: undefined,
      fuelConsumptionLPer100Km: undefined,
      needsReview: false,
      fuelStatus: "ok",
      reviewReasons: [],
    };

    if (!vehicleId || !vehicleById.has(vehicleId)) {
      unassignedEntryIds.push(entry.id);
      addIssue(issues, entry.id, "needs_review", "Brak przypisanego pojazdu.");
    }
    if (numberOrZero(entry.litry) <= 0) {
      addIssue(issues, entry.id, "suspicious_liters", "Brak poprawnej liczby litrów.");
    }
    if (numberOrZero(entry.odometerKm) <= 0) {
      addIssue(issues, entry.id, "missing_odometer_photo", "Brak przebiegu pojazdu.");
    }
    if (!hasAttachment(entry, "receipt")) {
      addIssue(issues, entry.id, "missing_receipt_photo", "Brak zdjęcia paragonu albo faktury.");
    }
    if (!hasAttachment(entry, "odometer")) {
      addIssue(issues, entry.id, "missing_odometer_photo", "Brak zdjęcia licznika lub tachografu.");
    }
    if ((entry.zalaczniki ?? []).some((attachment) => attachment.aiNeedsReview)) {
      addIssue(issues, entry.id, "uncertain_ai", "AI oznaczyło odczyt jako niepewny.");
    }
    if (!entry.vatRate) {
      addIssue(issues, entry.id, "vat_review", "VAT wymaga ręcznego sprawdzenia.");
    }
    return next;
  });

  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const groups = new Map<string, WpisTankowania[]>();
  for (const entry of entries) {
    if (!entry.vehicleId || !vehicleById.has(entry.vehicleId)) continue;
    const group = groups.get(entry.vehicleId) ?? [];
    group.push(entry);
    groups.set(entry.vehicleId, group);
  }

  const segments: FuelChainSegment[] = [];

  for (const [vehicleId, vehicleEntries] of groups) {
    const vehicle = vehicleById.get(vehicleId)!;

    const dateOrdered = [...vehicleEntries]
      .filter((entry) => numberOrZero(entry.odometerKm) > 0)
      .sort((a, b) => entryDate(a).localeCompare(entryDate(b)) || timestamp(a).localeCompare(timestamp(b)));
    for (let index = 1; index < dateOrdered.length; index += 1) {
      const previous = dateOrdered[index - 1];
      const current = dateOrdered[index];
      if (numberOrZero(current.odometerKm) <= numberOrZero(previous.odometerKm)) {
        addIssue(
          issues,
          current.id,
          "invalid_odometer",
          "Przebieg jest mniejszy lub równy wcześniejszemu wpisowi tego pojazdu."
        );
      }
    }

    const ordered = vehicleEntries
      .filter((entry) => isOfficialEntry(entry, includePending))
      .sort(compareFuelEntries);

    let anchor: WpisTankowania | null = null;
    let pendingEntries: WpisTankowania[] = [];

    for (const entry of ordered) {
      const liters = numberOrZero(entry.litry);
      const gross = numberOrZero(entry.koszt);
      const odometer = numberOrZero(entry.odometerKm);
      const isFullTank = entry.isFullTank ?? true;
      const mathematicallyValid = liters > 0 && gross > 0 && odometer > 0;

      if (isFullTank && liters > 0) {
        if (liters > vehicle.tankCapacityLiters) {
          addIssue(
            issues,
            entry.id,
            "suspicious_liters",
            `Zatankowano więcej niż pojemność zbiornika pojazdu (${vehicle.tankCapacityLiters} l).`
          );
        } else {
          entry.fuelBeforeRefuelLiters = round2(vehicle.tankCapacityLiters - liters);
        }
      }

      if (!mathematicallyValid || liters > vehicle.tankCapacityLiters) continue;

      if (!anchor) {
        if (isFullTank) {
          anchor = entry;
          pendingEntries = [];
          addIssue(
            issues,
            entry.id,
            "no_previous_refuel",
            "Brak wcześniejszego pełnego tankowania — ten wpis jest punktem startowym."
          );
        } else {
          addIssue(
            issues,
            entry.id,
            "no_previous_refuel",
            "Tankowanie częściowe nie ma wcześniejszego pełnego punktu startowego."
          );
        }
        continue;
      }

      pendingEntries.push(entry);
      if (!isFullTank) continue;

      const startOdometer = numberOrZero(anchor.odometerKm);
      const distanceKm = round2(odometer - startOdometer);
      if (distanceKm <= 0) {
        addIssue(issues, entry.id, "invalid_odometer", "Przebieg musi być większy niż przy poprzednim pełnym tankowaniu.");
        pendingEntries = [];
        anchor = entry;
        continue;
      }

      const cycleLiters = round2(pendingEntries.reduce((sum, item) => sum + numberOrZero(item.litry), 0));
      const grossAmount = round2(pendingEntries.reduce((sum, item) => sum + numberOrZero(item.koszt), 0));
      const netAmount = round2(pendingEntries.reduce((sum, item) => sum + fuelNetAmount(item), 0));
      const vatAmount = round2(grossAmount - netAmount);
      const consumption = round2((cycleLiters / distanceKm) * 100);
      const grossPerKm = round2(grossAmount / distanceKm);
      const netPerKm = round2(netAmount / distanceKm);

      entry.previousOdometerKm = startOdometer;
      entry.kmSinceLastFuel = distanceKm;
      entry.fuelConsumptionLPer100Km = consumption;
      entry.costPerKmGross = grossPerKm;
      entry.costPerKmNet = netPerKm;

      if (distanceKm < 10 || consumption < 3 || consumption > 40) {
        addIssue(issues, entry.id, "needs_review", "Spalanie lub dystans wygląda nietypowo i wymaga sprawdzenia.");
      }

      segments.push({
        vehicleId,
        vehicleName: vehicle.name,
        startEntryId: anchor.id,
        endEntryId: entry.id,
        entryIds: pendingEntries.map((item) => item.id),
        startDate: entryDate(anchor),
        endDate: entryDate(entry),
        startOdometerKm: startOdometer,
        endOdometerKm: odometer,
        distanceKm,
        liters: cycleLiters,
        grossAmount,
        netAmount,
        vatAmount,
        consumptionLPer100Km: consumption,
        costPerKmGross: grossPerKm,
        costPerKmNet: netPerKm,
      });

      anchor = entry;
      pendingEntries = [];
    }
  }

  for (const entry of entries) {
    const state = issues.get(entry.id) ?? { statuses: [], reasons: [] };
    const status = statusPriority(state.statuses);
    entry.fuelStatus = status;
    entry.needsReview = status !== "ok";
    entry.reviewReasons = [...new Set(state.reasons)];
    byId.set(entry.id, entry);
  }

  return {
    entries: sourceEntries.map((entry) => byId.get(entry.id) ?? entry),
    segments,
    unassignedEntryIds,
  };
}

export function recalculateWorkspaceFuelChains(
  data: WorkspaceData,
  options?: { includePending?: boolean }
): WorkspaceFuelRecalculation {
  const vehicles = getFuelVehicles(data);
  const allEntries = FUEL_ACCOUNTING_MONTHS.flatMap(
    (month) => data.miesiace?.[month]?.tankowanie ?? []
  );
  const result = recalculateFuelChain(allEntries, {
    vehicles,
    defaultVehicleId: vehicles.length === 1 ? vehicles[0].id : undefined,
    includePending: options?.includePending,
  });
  const byId = new Map(result.entries.map((entry) => [entry.id, entry]));
  const months: WorkspaceData["miesiace"] = { ...data.miesiace };

  for (const month of FUEL_ACCOUNTING_MONTHS) {
    const current = data.miesiace?.[month];
    if (!current) continue;
    months[month] = {
      ...current,
      tankowanie: (current.tankowanie ?? []).map((entry) => byId.get(entry.id) ?? entry),
    };
  }

  return {
    data: { ...data, vehicles, miesiace: months },
    result,
  };
}
