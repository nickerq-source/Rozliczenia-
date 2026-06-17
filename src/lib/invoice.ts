// Parsing PDF faktur transportowych Żabki — najpierw rekordy, potem filtrowanie.

import { KIEROWCA, TYP_TRANSPORTU, VAT } from "./config";

// ─── POMOCNICZE ───────────────────────────────────────────────────────────────

/** Obsługuje zarówno "13659,51" jak i "13659.51". Puste = 0. */
export function parsePolishNumber(s: string | undefined | null): number {
  if (!s || !s.trim()) return 0;
  const normalized = s.trim().replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}

export function normalizeInvoiceText(value: string | undefined | null): string {
  return (value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toISODate(d: Date): string {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function validISODate(value: string | undefined | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value + "T12:00:00");
  return isNaN(d.getTime()) ? null : value;
}

function isNumberToken(token: string | undefined): boolean {
  return !!token && /^\d{1,6}(?:[,\.]\d{1,4})?$/.test(token);
}

function isStatusToken(token: string | undefined): boolean {
  return !!token && /^(Rozliczony|Zrealizowan|Zrealizowany)$/i.test(token);
}

function normalizeStatus(tokens: string[]): string {
  const idx = tokens.findIndex(isStatusToken);
  if (idx < 0) return "";
  if (/^Zrealizowan$/i.test(tokens[idx]) && /^y$/i.test(tokens[idx + 1] ?? "")) {
    return "Zrealizowany";
  }
  return tokens[idx];
}

// ─── TYPY ─────────────────────────────────────────────────────────────────────

export type InvoiceCarUsageType =
  | "driver_car"
  | "company_car"
  | "replacement_car"
  | "unknown";

export type InvoiceVehicleFilterMode = "none" | "plate";

export interface InvoiceVehicleAssignmentRule {
  id: string;
  driverName: string;
  dateFrom: string;
  dateTo: string;
  vehiclePlate: string;
  vehicleOwnerType: InvoiceCarUsageType;
  includeInSettlement: boolean;
  reason?: string;
  active: boolean;
}

export interface InvoiceRecordOverride {
  transportOrderId: string;
  vehiclePlate?: string;
  includeInSettlement: boolean;
  exclusionReason?: string;
  manuallyOverridden: boolean;
}

export interface InvoiceRecord {
  orderNumber: string;
  route: string;
  driverName: string;
  vehicleType: string;
  loadingDate: string | null;
  distanceKm: number;
  palletPlaces: number;
  weight: number;
  notes: string;
  confirmedCost: number;
  lineCost: number;
  distributionCost: number;
  viatolCost: number;
  otherCost: number;
  galaxyCost: number;
  status: string;
  invitationId: string | null;
  carrierCode: string | null;
  currency: string | null;
  saleDate: string | null;
  vehicleOwner: InvoiceCarUsageType;
  needsReview: boolean;
  parseWarnings: string[];
  rawText: string;
}

export interface InvoiceFilter {
  driverName: string;
  vehicleType: string;
  dateFrom: string | null;
  dateTo: string | null;
  settlementVehiclePlate?: string | null;
  settlementVehicleMode?: InvoiceVehicleFilterMode;
}

export interface InvoiceDiagnosticRow {
  orderNumber: string;
  date: string | null;
  driverName: string;
  vehicleType: string;
  route: string;
  km: number;
  cost: number;
  notes: string;
  status: string;
  invitationId: string | null;
  vehicleOwner: InvoiceCarUsageType;
  vehiclePlate?: string | null;
  vehicleRuleReason?: string;
  manuallyOverridden?: boolean;
  isAdditional?: boolean;
  reason: string;
  rawText?: string;
}

export interface ParsedInvoice {
  invoiceNumber: string | null;
  filters: InvoiceFilter;
  ileKolek: number; // trasy bez komentarza w Uwagach
  ileZlecen: number; // wiersze dodatkowe / z komentarzem w Uwagach
  sumaKm: number;
  netto: number;
  brutto: number;
  sredniaKm: number;
  sredniaNetto: number;
  sredniaBrutto: number;
  zakresOd: string | null;
  zakresDo: string | null;
  includedRows: InvoiceDiagnosticRow[];
  rejectedRows: InvoiceDiagnosticRow[];
  allRows: InvoiceRecord[];
  _debugText?: string;
}

export interface ParseInvoiceOptions {
  driverName?: string;
  vehicleType?: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  /** @deprecated PDF Żabki nie zawiera numerów rejestracyjnych; nie używać do nowych importów. */
  settlementVehiclePlate?: string | null;
  /** @deprecated PDF Żabki nie zawiera numerów rejestracyjnych; nie używać do nowych importów. */
  settlementVehicleMode?: InvoiceVehicleFilterMode;
  /** @deprecated PDF Żabki nie zawiera numerów rejestracyjnych; nie używać do nowych importów. */
  vehicleAssignmentRules?: InvoiceVehicleAssignmentRule[];
  recordOverrides?: InvoiceRecordOverride[];
}

// ─── NUMER FAKTURY ────────────────────────────────────────────────────────────

export function extractInvoiceNumber(text: string): string | null {
  const patterns = [
    /\b(58\d{8,12})\b/,
    /Rozliczony\s+(\d{6,15})/i,
    /Numer\s*faktury[:\s]+([A-Z0-9/_-]+)/i,
    /Nr\s*faktury[:\s]+([A-Z0-9/_-]+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

// ─── PARSOWANIE REKORDÓW ──────────────────────────────────────────────────────

const ORDER_RE = /^\s*(\d{2,6}\/\d{2}\/\d{2}CLKR2)\b/i;
const VEHICLE_RE = /\b\d+\/\d+\b/;
const ISO_RE = /\b\d{4}-\d{2}-\d{2}\b/g;

function extractContinuationSurname(lines: string[]): string | null {
  for (const line of lines.slice(0, 3)) {
    const afterComma = line.match(/,\s*([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż-]{2,})\b/);
    if (afterComma) return afterComma[1].toUpperCase();
  }
  return null;
}

function splitRouteDriver(beforeType: string, continuationLines: string[]): { route: string; driverName: string } {
  const cleaned = beforeType.replace(/[,]+/g, " ").replace(/\s+/g, " ").trim();
  const tokens = cleaned.split(" ").filter(Boolean);
  if (tokens.length === 0) return { route: "", driverName: "" };

  const continuationSurname = extractContinuationSurname(continuationLines);
  if (continuationSurname && tokens.length >= 1) {
    const firstName = tokens[tokens.length - 1];
    return {
      route: tokens.slice(0, -1).join(" "),
      driverName: `${firstName} ${continuationSurname}`.replace(/\s+/g, " ").trim(),
    };
  }

  if (tokens.length >= 2) {
    return {
      route: tokens.slice(0, -2).join(" "),
      driverName: tokens.slice(-2).join(" "),
    };
  }

  return { route: "", driverName: tokens[0] };
}

function parseAfterDate(afterDate: string): {
  distanceKm: number;
  palletPlaces: number;
  weight: number;
  notes: string;
  confirmedCost: number;
  lineCost: number;
  distributionCost: number;
  viatolCost: number;
  otherCost: number;
  galaxyCost: number;
  status: string;
  invitationId: string | null;
  carrierCode: string | null;
  currency: string | null;
  saleDate: string | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  const tokens = afterDate.trim().split(/\s+/).filter(Boolean);

  const distanceKm = parsePolishNumber(tokens[0]);
  const palletPlaces = parsePolishNumber(tokens[1]);
  const weight = parsePolishNumber(tokens[2]);
  let cursor = 3;
  const notesTokens: string[] = [];

  while (cursor < tokens.length && !isNumberToken(tokens[cursor]) && !isStatusToken(tokens[cursor])) {
    notesTokens.push(tokens[cursor]);
    cursor++;
  }

  const numericCosts: number[] = [];
  while (cursor < tokens.length && numericCosts.length < 6) {
    if (isStatusToken(tokens[cursor])) break;
    if (isNumberToken(tokens[cursor])) numericCosts.push(parsePolishNumber(tokens[cursor]));
    else if (tokens[cursor]) notesTokens.push(tokens[cursor]);
    cursor++;
  }

  const status = normalizeStatus(tokens);
  const invitationId = tokens.find((t) => /^58\d{8,12}$/.test(t)) ?? null;
  const invitationIdx = invitationId ? tokens.indexOf(invitationId) : -1;
  const carrierCode =
    invitationIdx >= 0 && /^\d{6,15}$/.test(tokens[invitationIdx + 1] ?? "")
      ? tokens[invitationIdx + 1]
      : null;
  const currency = tokens.find((t) => t === "PLN") ?? null;
  const dates = Array.from(afterDate.matchAll(ISO_RE)).map((m) => m[0]);
  const saleDate = dates[dates.length - 1] ?? null;

  if (tokens.length < 4) warnings.push("za mało kolumn liczbowych");
  if (distanceKm === 0) warnings.push("brak km");
  if (numericCosts[0] == null || numericCosts[0] === 0) warnings.push("brak kwoty");

  return {
    distanceKm,
    palletPlaces,
    weight,
    notes: notesTokens.join(" ").trim(),
    confirmedCost: numericCosts[0] ?? 0,
    lineCost: numericCosts[1] ?? 0,
    distributionCost: numericCosts[2] ?? 0,
    viatolCost: numericCosts[3] ?? 0,
    otherCost: numericCosts[4] ?? 0,
    galaxyCost: numericCosts[5] ?? 0,
    status,
    invitationId,
    carrierCode,
    currency,
    saleDate,
    warnings,
  };
}

function parseRecordBlock(block: string[]): InvoiceRecord | null {
  const main = block[0] ?? "";
  const orderMatch = main.match(ORDER_RE);
  if (!orderMatch) return null;

  const orderNumber = orderMatch[1];
  const afterOrderOffset = orderMatch[0].length;
  const afterOrder = main.slice(afterOrderOffset);
  const vehicleMatch = afterOrder.match(VEHICLE_RE);
  const dateMatch = main.match(/\b\d{4}-\d{2}-\d{2}\b/);
  const vehicleIndex = vehicleMatch?.index == null ? null : afterOrderOffset + vehicleMatch.index;
  if (!vehicleMatch || !dateMatch || vehicleIndex == null || dateMatch.index == null) {
    return {
      orderNumber,
      route: "",
      driverName: "",
      vehicleType: vehicleMatch?.[0] ?? "",
      loadingDate: dateMatch?.[0] ?? null,
      distanceKm: 0,
      palletPlaces: 0,
      weight: 0,
      notes: "",
      confirmedCost: 0,
      lineCost: 0,
      distributionCost: 0,
      viatolCost: 0,
      otherCost: 0,
      galaxyCost: 0,
      status: "",
      invitationId: null,
      carrierCode: null,
      currency: null,
      saleDate: null,
      vehicleOwner: "unknown",
      needsReview: true,
      parseWarnings: ["brak typu transportu albo daty"],
      rawText: block.join(" "),
    };
  }

  const beforeType = main
    .slice(afterOrderOffset, vehicleIndex)
    .replace(/\s+/g, " ")
    .trim();
  const continuationLines = block.slice(1);
  const { route, driverName } = splitRouteDriver(beforeType, continuationLines);
  const afterDate = main.slice(dateMatch.index + dateMatch[0].length);
  const parsed = parseAfterDate(afterDate);
  const needsReview = parsed.warnings.length > 0 || !driverName || !parsed.status;

  return {
    orderNumber,
    route,
    driverName,
    vehicleType: vehicleMatch[0],
    loadingDate: dateMatch[0],
    distanceKm: parsed.distanceKm,
    palletPlaces: parsed.palletPlaces,
    weight: parsed.weight,
    notes: parsed.notes,
    confirmedCost: parsed.confirmedCost,
    lineCost: parsed.lineCost,
    distributionCost: parsed.distributionCost,
    viatolCost: parsed.viatolCost,
    otherCost: parsed.otherCost,
    galaxyCost: parsed.galaxyCost,
    status: parsed.status,
    invitationId: parsed.invitationId,
    carrierCode: parsed.carrierCode,
    currency: parsed.currency,
    saleDate: parsed.saleDate,
    vehicleOwner: "unknown",
    needsReview,
    parseWarnings: parsed.warnings,
    rawText: block.join(" "),
  };
}

export function parseInvoiceRecords(rawText: string): InvoiceRecord[] {
  const lines = rawText
    .split("\n")
    .map((l) => l.replace(/\t/g, " ").replace(/\s{2,}/g, " ").trim())
    .filter((l) => l.length > 0);

  const blocks: string[][] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    if (ORDER_RE.test(line)) {
      if (current) blocks.push(current);
      current = [line];
      continue;
    }
    if (current) current.push(line);
  }
  if (current) blocks.push(current);

  return blocks
    .map(parseRecordBlock)
    .filter((row): row is InvoiceRecord => row !== null);
}

export function getDefaultInvoiceDateRange(
  records: InvoiceRecord[],
  selectedDriverName: string,
  selectedVehicleType: string
): { dateFrom: string | null; dateTo: string | null } {
  const dates = records
    .filter(
      (row) =>
        normalizeInvoiceText(row.driverName) === normalizeInvoiceText(selectedDriverName) &&
        normalizeInvoiceText(row.vehicleType) === normalizeInvoiceText(selectedVehicleType) &&
        !!row.loadingDate
    )
    .map((row) => row.loadingDate as string)
    .sort();

  return {
    dateFrom: dates[0] ?? null,
    dateTo: dates[dates.length - 1] ?? null,
  };
}

function isAdditionalOrder(row: InvoiceRecord): boolean {
  return !!row.notes.trim() || /\/I\b/i.test(row.rawText);
}

interface VehicleResolution {
  vehicleOwner: InvoiceCarUsageType;
  vehiclePlate: string | null;
  vehicleRuleReason?: string;
  manuallyOverridden?: boolean;
  rejectReason?: string;
  includeReason?: string;
}

function normalizePlate(value: string | undefined | null): string {
  return normalizeInvoiceText(value).replace(/\s+/g, "");
}

function vehicleOwnerLabel(value: InvoiceCarUsageType): string {
  switch (value) {
    case "driver_car":
      return "auto kierowcy";
    case "company_car":
      return "auto Artura / firmowe";
    case "replacement_car":
      return "auto zastępcze";
    default:
      return "auto nieustalone";
  }
}

function matchRule(row: InvoiceRecord, rule: InvoiceVehicleAssignmentRule): boolean {
  if (!rule.active) return false;
  if (!row.loadingDate) return false;
  if (normalizeInvoiceText(row.driverName) !== normalizeInvoiceText(rule.driverName)) return false;
  return row.loadingDate >= rule.dateFrom && row.loadingDate <= rule.dateTo;
}

function resolveVehicleForRow(
  row: InvoiceRecord,
  filter: InvoiceFilter,
  rules: InvoiceVehicleAssignmentRule[],
  overrides: InvoiceRecordOverride[]
): VehicleResolution {
  const mode = filter.settlementVehicleMode ?? "none";
  const selectedPlate = normalizePlate(filter.settlementVehiclePlate);
  const override = overrides.find((o) => o.transportOrderId === row.orderNumber);

  if (override) {
    const plate = override.vehiclePlate?.trim() || null;
    if (!override.includeInSettlement) {
      return {
        vehicleOwner: row.vehicleOwner,
        vehiclePlate: plate,
        manuallyOverridden: true,
        rejectReason: override.exclusionReason || "ręcznie wykluczono z rozliczenia",
      };
    }
    return {
      vehicleOwner: row.vehicleOwner,
      vehiclePlate: plate,
      manuallyOverridden: true,
      includeReason: plate
        ? `ręcznie uwzględnione; auto ${plate}`
        : "ręcznie uwzględnione mimo reguły auta",
    };
  }

  const rule = rules.find((r) => matchRule(row, r));
  if (!rule) {
    if (mode === "plate" && selectedPlate) {
      return {
        vehicleOwner: "unknown",
        vehiclePlate: null,
        rejectReason: "brak reguły auta dla tego dnia",
      };
    }
    return {
      vehicleOwner: "unknown",
      vehiclePlate: null,
    };
  }

  const plate = rule.vehiclePlate.trim();
  const plateMatches = normalizePlate(plate) === selectedPlate;
  const ownerLabel = vehicleOwnerLabel(rule.vehicleOwnerType);
  const ruleReason = rule.reason?.trim() || undefined;

  if (mode === "plate" && selectedPlate) {
    if (!rule.includeInSettlement || !plateMatches) {
      return {
        vehicleOwner: rule.vehicleOwnerType,
        vehiclePlate: plate,
        vehicleRuleReason: ruleReason,
        rejectReason: `Inny samochód: ${plate} / ${ownerLabel} — nie liczone do ${filter.settlementVehiclePlate}`,
      };
    }
    return {
      vehicleOwner: rule.vehicleOwnerType,
      vehiclePlate: plate,
      vehicleRuleReason: ruleReason,
      includeReason: `auto ${plate}`,
    };
  }

  return {
    vehicleOwner: rule.vehicleOwnerType,
    vehiclePlate: plate,
    vehicleRuleReason: ruleReason,
  };
}

function diagnosticRow(
  row: InvoiceRecord,
  reason: string,
  debug = false,
  vehicle?: VehicleResolution
): InvoiceDiagnosticRow {
  return {
    orderNumber: row.orderNumber,
    date: row.loadingDate,
    driverName: row.driverName,
    vehicleType: row.vehicleType,
    route: row.route,
    km: row.distanceKm,
    cost: row.confirmedCost,
    notes: row.notes,
    status: row.status,
    invitationId: row.invitationId,
    vehicleOwner: vehicle?.vehicleOwner ?? row.vehicleOwner,
    vehiclePlate: vehicle?.vehiclePlate ?? null,
    vehicleRuleReason: vehicle?.vehicleRuleReason,
    manuallyOverridden: vehicle?.manuallyOverridden,
    isAdditional: isAdditionalOrder(row),
    reason,
    ...(debug ? { rawText: row.rawText.slice(0, 600) } : {}),
  };
}

function baseRejectReasons(row: InvoiceRecord, filter: InvoiceFilter): string[] {
  const reasons: string[] = [];
  if (!row.loadingDate) reasons.push("brak daty");
  if (row.confirmedCost <= 0) reasons.push("brak kwoty");
  if (row.needsReview) reasons.push("rekord niepewny");

  if (normalizeInvoiceText(row.driverName) !== normalizeInvoiceText(filter.driverName)) {
    reasons.push("inny kierowca");
  }
  if (normalizeInvoiceText(row.vehicleType) !== normalizeInvoiceText(filter.vehicleType)) {
    reasons.push("inny typ środka transportu");
  }
  if (filter.dateFrom && row.loadingDate && row.loadingDate < filter.dateFrom) {
    reasons.push("poza wybranym zakresem dat");
  }
  if (filter.dateTo && row.loadingDate && row.loadingDate > filter.dateTo) {
    reasons.push("poza wybranym zakresem dat");
  }

  return Array.from(new Set(reasons));
}

function includeReason(row: InvoiceRecord, vehicle: VehicleResolution): string {
  const base = isAdditionalOrder(row)
    ? "zgodny kierowca, typ i zakres dat; zlecenie z uwagą"
    : "zgodny kierowca, typ i zakres dat; kurs /D";
  if (vehicle.includeReason?.startsWith("ręcznie")) return `${base}; ${vehicle.includeReason}`;
  return base;
}

// ─── GŁÓWNA FUNKCJA ───────────────────────────────────────────────────────────

/** Parsuje surowy tekst PDF i filtruje po konkretnych polach rekordu. */
export function parseInvoicePDF(
  rawText: string,
  debugMode = false,
  options: ParseInvoiceOptions = {}
): ParsedInvoice {
  const invoiceNumber = extractInvoiceNumber(rawText);
  const allRows = parseInvoiceRecords(rawText);
  const driverName = options.driverName?.trim() || KIEROWCA;
  const vehicleType = options.vehicleType?.trim() || TYP_TRANSPORTU;
  const defaultRange = getDefaultInvoiceDateRange(allRows, driverName, vehicleType);
  const filter: InvoiceFilter = {
    driverName,
    vehicleType,
    dateFrom: validISODate(options.dateFrom) ?? defaultRange.dateFrom,
    dateTo: validISODate(options.dateTo) ?? defaultRange.dateTo,
    settlementVehiclePlate: null,
    settlementVehicleMode: "none",
  };
  const vehicleAssignmentRules: InvoiceVehicleAssignmentRule[] = [];
  const recordOverrides = options.recordOverrides ?? [];

  const included: InvoiceRecord[] = [];
  const includedRows: InvoiceDiagnosticRow[] = [];
  const rejectedRows: InvoiceDiagnosticRow[] = [];

  for (const row of allRows) {
    const vehicle = resolveVehicleForRow(row, filter, vehicleAssignmentRules, recordOverrides);
    const reasons = baseRejectReasons(row, filter);
    if (vehicle.rejectReason && reasons.length === 0) {
      reasons.push(vehicle.rejectReason);
    }
    if (reasons.length === 0) {
      included.push(row);
      includedRows.push(diagnosticRow(row, includeReason(row, vehicle), debugMode, vehicle));
    } else {
      rejectedRows.push(diagnosticRow(row, reasons.join(", "), debugMode, vehicle));
    }
  }

  return buildResult(invoiceNumber, included, filter, includedRows, rejectedRows, allRows, debugMode ? rawText : undefined);
}

// ─── OBLICZENIA SUMARYCZNE ────────────────────────────────────────────────────

export function buildResult(
  invoiceNumber: string | null,
  rows: InvoiceRecord[],
  filters: InvoiceFilter,
  includedRows: InvoiceDiagnosticRow[] = [],
  rejectedRows: InvoiceDiagnosticRow[] = [],
  allRows: InvoiceRecord[] = rows,
  debugText?: string
): ParsedInvoice {
  const ileZlecen = rows.filter(isAdditionalOrder).length;
  const ileKolek = rows.length - ileZlecen;
  const total = rows.length;
  const sumaKm = rows.reduce((s, r) => s + r.distanceKm, 0);
  const netto = round2(rows.reduce((s, r) => s + r.confirmedCost, 0));
  const brutto = round2(netto * (1 + VAT));
  const sredniaKm = total > 0 ? round2(sumaKm / total) : 0;
  const sredniaNetto = total > 0 ? round2(netto / total) : 0;
  const sredniaBrutto = total > 0 ? round2(brutto / total) : 0;

  const dates = rows
    .map((r) => {
      const d = new Date((r.loadingDate ?? "") + "T12:00:00");
      return isNaN(d.getTime()) ? null : d;
    })
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    invoiceNumber,
    filters,
    ileKolek,
    ileZlecen,
    sumaKm,
    netto,
    brutto,
    sredniaKm,
    sredniaNetto,
    sredniaBrutto,
    zakresOd: dates.length > 0 ? toISODate(dates[0]) : filters.dateFrom,
    zakresDo: dates.length > 0 ? toISODate(dates[dates.length - 1]) : filters.dateTo,
    includedRows,
    rejectedRows,
    allRows,
    ...(debugText !== undefined ? { _debugText: debugText.slice(0, 3000) } : {}),
  };
}
