import type { DaneMiesiaca, FuelVehicleConfig, KosztVatInfo, WorkspaceData, WpisTankowania } from "./types";
import type { DriverId } from "./admin-navigation";
import { DEFAULT_FUEL_VEHICLE } from "./recalculate-fuel-chain";

export function driverVehicles(vehicles: FuelVehicleConfig[] | undefined, driver: DriverId) {
  return (vehicles?.length ? vehicles : [DEFAULT_FUEL_VEHICLE]).filter(v =>
    (v.driverId ?? (v.id === DEFAULT_FUEL_VEHICLE.id ? "zenia" : undefined)) === driver);
}

// The original workspace contained only Zenia's operating costs. No records are moved or copied.
export function costDriver(cost: KosztVatInfo & { vehicleId?: string }, vehicles?: FuelVehicleConfig[]): DriverId {
  if (cost.driverId) return cost.driverId;
  const assigned = vehicles?.find(v => v.id === cost.vehicleId)?.driverId;
  return assigned ?? "zenia";
}

export function driverMonth(month: DaneMiesiaca, driver: DriverId, vehicles?: FuelVehicleConfig[], vehicleId?: string): DaneMiesiaca {
  return { ...month,
    tankowanie: month.tankowanie.filter(t => costDriver(t, vehicles) === driver && (!vehicleId || t.vehicleId === vehicleId || (!t.vehicleId && vehicleId === DEFAULT_FUEL_VEHICLE.id))),
    inneKoszty: month.inneKoszty.filter(c => costDriver(c, vehicles) === driver),
    leasing: driver === "zenia" ? month.leasing : 0,
  };
}

/** Merge edits into the selected slice only; never replace another driver's rows. */
export function updateDriverMonth(month: DaneMiesiaca, driver: DriverId, vehicles: FuelVehicleConfig[] | undefined,
  updater: (current: DaneMiesiaca) => DaneMiesiaca, vehicleId?: string): DaneMiesiaca {
  const scoped = driverMonth(month, driver, vehicles, vehicleId);
  const updated = updater(scoped);
  const merge = <T extends KosztVatInfo & { id: string }>(all: T[], before: T[], after: T[]): T[] => {
    const ids = new Set(before.map(row => row.id));
    const next = new Map(after.map(row => [row.id, { ...row, driverId: driver }]));
    const originalIds = new Set(all.map(row => row.id));
    return [...all.flatMap(row => ids.has(row.id) ? next.has(row.id) ? [next.get(row.id)!] : [] : [row]),
      ...after.filter(row => !originalIds.has(row.id)).map(row => ({ ...row, driverId: driver }))];
  };
  return { ...month,
    ...(driver === "zenia" ? { dni: updated.dni, wyplata: updated.wyplata, zgloszenia: updated.zgloszenia, obciazenia: updated.obciazenia, leasing: updated.leasing } : {}),
    tankowanie: merge<WpisTankowania>(month.tankowanie, scoped.tankowanie, updated.tankowanie).map(t =>
      costDriver(t, vehicles) === driver && !t.vehicleId && vehicleId ? { ...t, vehicleId } : t),
    inneKoszty: merge(month.inneKoszty, scoped.inneKoszty, updated.inneKoszty),
  };
}

export function driverMonths(data: WorkspaceData, driver: DriverId, vehicleId?: string): WorkspaceData["miesiace"] {
  return Object.fromEntries(Object.entries(data.miesiace).map(([m, month]) => [m, driverMonth(month!, driver, data.vehicles, vehicleId)]));
}

export function vehicleMonths(data: WorkspaceData, vehicleId: string): WorkspaceData["miesiace"] {
  return Object.fromEntries(Object.entries(data.miesiace).map(([m, month]) => [m, { ...month!,
    tankowanie: month!.tankowanie.filter(t => t.vehicleId === vehicleId || !t.vehicleId && vehicleId === DEFAULT_FUEL_VEHICLE.id),
  }]));
}

export function driverVehicleHistory(data: WorkspaceData, driver: DriverId): FuelVehicleConfig[] {
  const ids = new Set(driverVehicles(data.vehicles, driver).map(v => v.id));
  for (const month of Object.values(data.miesiace)) {
    for (const entry of month?.tankowanie ?? []) {
      if (costDriver(entry, data.vehicles) === driver) ids.add(entry.vehicleId ?? DEFAULT_FUEL_VEHICLE.id);
    }
  }
  return (data.vehicles?.length ? data.vehicles : [DEFAULT_FUEL_VEHICLE]).filter(v => ids.has(v.id));
}

export function assignDriverVehicle(data: WorkspaceData, vehicle: FuelVehicleConfig): WorkspaceData {
  // Pin historic cost ownership before changing a vehicle's current driver.
  const vehicles = data.vehicles?.length ? data.vehicles : [DEFAULT_FUEL_VEHICLE];
  return { ...data, vehicles: [...vehicles.filter(v => v.id !== vehicle.id), vehicle],
    miesiace: Object.fromEntries(Object.entries(data.miesiace).map(([m, month]) => [m, { ...month,
      tankowanie: month!.tankowanie.map(t => ({ ...t,
        driverId: costDriver(t, vehicles),
        vehicleId: t.vehicleId ?? (vehicles.length === 1 ? vehicles[0].id : undefined),
      })),
    }])),
  };
}
