export const FLEET_DRIVERS = ["YEVHENII PITIANIN", "RAFAL GUSTAB"] as const;

export function fleetDriverKey(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/gi, "l").toUpperCase().replace(/\s+/g, " ").trim();
}

export function matchesInvoiceDriver(name: string, filter: { driverName: string; driverNames?: string[] }): boolean {
  return (filter.driverNames?.length ? filter.driverNames : [filter.driverName]).some(driver => fleetDriverKey(driver) === fleetDriverKey(name));
}
