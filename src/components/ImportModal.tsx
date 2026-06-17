"use client";

// Modal po wgraniu PDF: podsumowanie importu lub komunikat o braku danych

import { useEffect, useMemo, useState } from "react";
import { KIEROWCA, TYP_TRANSPORTU } from "@/lib/config";
import { formatZl } from "@/lib/business-logic";
import { cn } from "@/lib/utils";
import { useAppBackLayer } from "@/lib/mobile-navigation";

interface ImportFilterInfo {
  driverName: string;
  vehicleType: string;
  dateFrom: string | null;
  dateTo: string | null;
  settlementVehiclePlate?: string | null;
  settlementVehicleMode?: "none" | "plate";
}

interface VehicleAssignmentRule {
  id: string;
  driverName: string;
  dateFrom: string;
  dateTo: string;
  vehiclePlate: string;
  vehicleOwnerType: ImportDiagnosticRow["vehicleOwner"];
  includeInSettlement: boolean;
  reason?: string;
  active: boolean;
}

interface RecordOverride {
  transportOrderId: string;
  vehiclePlate?: string;
  includeInSettlement: boolean;
  exclusionReason?: string;
  manuallyOverridden: boolean;
}

interface ImportDiagnosticRow {
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
  vehicleOwner: "driver_car" | "company_car" | "replacement_car" | "unknown";
  vehiclePlate?: string | null;
  vehicleRuleReason?: string;
  manuallyOverridden?: boolean;
  isAdditional?: boolean;
  reason: string;
  rawText?: string;
}

interface FilteredResult {
  filters?: ImportFilterInfo;
  ileKolek: number;
  ileZlecen?: number;
  sumaKm: number;
  netto: number;
  brutto: number;
  sredniaKm: number;
  sredniaNetto: number;
  sredniaBrutto: number;
  zakresOd: string | null; // YYYY-MM-DD
  zakresDo: string | null;
  includedRows?: ImportDiagnosticRow[];
  rejectedRows?: ImportDiagnosticRow[];
  sourceRows?: ImportDiagnosticRow[];
  vehicleAssignmentRules?: VehicleAssignmentRule[];
  recordOverrides?: RecordOverride[];
  settlementVehiclePlate?: string | null;
  settlementVehicleMode?: "none" | "plate";
  invoiceImportDateFrom?: string | null;
  invoiceImportDateTo?: string | null;
  manualDateRangeSelected?: boolean;
}

export interface ImportModalProps {
  // confirm = po wgraniu PDF (Anuluj / Zapisz), preview = podgląd zapisanego importu
  mode?: "preview" | "confirm";
  invoiceNumber: string | null;
  filtered: FilteredResult | null;
  message?: string;
  fileName: string;
  isOverwrite?: boolean;
  // Auto-wybrany tydzień docelowy (na podstawie dat z PDF)
  targetInfo?: { label: string; weekNumber: number; monthName: string };
  onConfirm: (filtered?: FilteredResult | null) => void;
  onCancel: () => void;
  onFilteredChange?: (filtered: FilteredResult) => void;
  // Tylko w trybie preview:
  onRemove?: () => void;
  onReupload?: () => void;
}

function isoToDisplay(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function Row({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-zinc-800 last:border-0">
      <span className={cn("text-sm", accent ? "font-semibold text-white" : "text-zinc-400")}>
        {label}
      </span>
      <span className={cn("tabular-nums text-sm font-medium", accent ? "text-amber-400 text-base font-bold" : "text-white")}>
        {value}
      </span>
    </div>
  );
}

function carUsageLabel(value: ImportDiagnosticRow["vehicleOwner"]): string {
  switch (value) {
    case "driver_car":
      return "Auto kierowcy";
    case "company_car":
      return "Auto firmowe / Artura";
    case "replacement_car":
      return "Auto zastępcze";
    default:
      return "Nieustalone";
  }
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

function normalizePlate(value: string | null | undefined): string {
  return normalizeText(value).replace(/\s+/g, "");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `rule-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function vehicleOwnerLabel(value: ImportDiagnosticRow["vehicleOwner"]): string {
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

function matchingRule(row: ImportDiagnosticRow, rules: VehicleAssignmentRule[]) {
  return rules.find((rule) => {
    if (!rule.active || !row.date) return false;
    if (normalizeText(rule.driverName) !== normalizeText(row.driverName)) return false;
    return row.date >= rule.dateFrom && row.date <= rule.dateTo;
  });
}

function calculateFilteredResult(
  base: FilteredResult,
  params: {
    dateFrom: string | null;
    dateTo: string | null;
    settlementVehicleMode: "none" | "plate";
    settlementVehiclePlate: string | null;
    rules: VehicleAssignmentRule[];
    overrides: RecordOverride[];
    manualDateRangeSelected: boolean;
  }
): FilteredResult {
  const sourceRows = base.sourceRows ?? [...(base.includedRows ?? []), ...(base.rejectedRows ?? [])];
  if (sourceRows.length === 0) return base;

  const driverName = base.filters?.driverName || KIEROWCA;
  const vehicleType = base.filters?.vehicleType || TYP_TRANSPORTU;
  const selectedPlate = normalizePlate(params.settlementVehiclePlate);
  const includedRows: ImportDiagnosticRow[] = [];
  const rejectedRows: ImportDiagnosticRow[] = [];

  for (const row of sourceRows) {
    const reasons: string[] = [];
    if (!row.date) reasons.push("brak daty");
    if (row.cost <= 0) reasons.push("brak kwoty");
    if (normalizeText(row.driverName) !== normalizeText(driverName)) reasons.push("inny kierowca");
    if (normalizeText(row.vehicleType) !== normalizeText(vehicleType)) reasons.push("inny typ środka transportu");
    if (params.dateFrom && row.date && row.date < params.dateFrom) reasons.push("poza zakresem dat");
    if (params.dateTo && row.date && row.date > params.dateTo) reasons.push("poza zakresem dat");

    const override = params.overrides.find((o) => o.transportOrderId === row.orderNumber);
    const rule = matchingRule(row, params.rules);
    const nextRow: ImportDiagnosticRow = {
      ...row,
      vehicleOwner: rule?.vehicleOwnerType ?? row.vehicleOwner ?? "unknown",
      vehiclePlate: rule?.vehiclePlate ?? row.vehiclePlate ?? null,
      vehicleRuleReason: rule?.reason ?? row.vehicleRuleReason,
      manuallyOverridden: !!override || row.manuallyOverridden,
    };

    if (override && reasons.length === 0) {
      nextRow.vehiclePlate = override.vehiclePlate ?? nextRow.vehiclePlate;
      if (!override.includeInSettlement) {
        reasons.push(override.exclusionReason || "ręcznie wykluczono z rozliczenia");
      } else {
        nextRow.reason = override.vehiclePlate
          ? `zgodny kierowca, typ i zakres dat; ręcznie uwzględnione; auto ${override.vehiclePlate}`
          : "zgodny kierowca, typ i zakres dat; ręcznie uwzględnione";
      }
    }

    if (!override && reasons.length === 0 && params.settlementVehicleMode === "plate" && selectedPlate) {
      if (!rule) {
        reasons.push("brak reguły auta dla tego dnia");
      } else if (!rule.includeInSettlement || normalizePlate(rule.vehiclePlate) !== selectedPlate) {
        reasons.push(
          `Inny samochód: ${rule.vehiclePlate} / ${vehicleOwnerLabel(rule.vehicleOwnerType)} — nie liczone do ${params.settlementVehiclePlate}`
        );
      } else {
        nextRow.reason = `zgodny kierowca, typ, zakres dat i auto ${rule.vehiclePlate}`;
      }
    }

    if (!override && reasons.length === 0 && params.settlementVehicleMode === "none") {
      nextRow.reason = row.isAdditional
        ? "zgodny kierowca, typ i zakres dat; zlecenie z uwagą; bez filtrowania po aucie"
        : "zgodny kierowca, typ i zakres dat; kurs /D; bez filtrowania po aucie";
    }

    if (reasons.length === 0) {
      includedRows.push(nextRow);
    } else {
      rejectedRows.push({ ...nextRow, reason: Array.from(new Set(reasons)).join(", ") });
    }
  }

  const total = includedRows.length;
  const ileZlecen = includedRows.filter((row) => row.isAdditional || !!row.notes.trim()).length;
  const ileKolek = total - ileZlecen;
  const sumaKm = includedRows.reduce((sum, row) => sum + row.km, 0);
  const netto = round2(includedRows.reduce((sum, row) => sum + row.cost, 0));
  const brutto = round2(netto * 1.23);
  const dates = includedRows.map((row) => row.date).filter((date): date is string => !!date).sort();

  return {
    ...base,
    filters: {
      driverName,
      vehicleType,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      settlementVehicleMode: params.settlementVehicleMode,
      settlementVehiclePlate: params.settlementVehicleMode === "plate" ? params.settlementVehiclePlate : null,
    },
    invoiceImportDateFrom: params.dateFrom,
    invoiceImportDateTo: params.dateTo,
    manualDateRangeSelected: params.manualDateRangeSelected,
    settlementVehicleMode: params.settlementVehicleMode,
    settlementVehiclePlate: params.settlementVehicleMode === "plate" ? params.settlementVehiclePlate : null,
    vehicleAssignmentRules: params.rules,
    recordOverrides: params.overrides,
    ileKolek,
    ileZlecen,
    sumaKm,
    netto,
    brutto,
    sredniaKm: total > 0 ? round2(sumaKm / total) : 0,
    sredniaNetto: total > 0 ? round2(netto / total) : 0,
    sredniaBrutto: total > 0 ? round2(brutto / total) : 0,
    zakresOd: dates[0] ?? params.dateFrom,
    zakresDo: dates[dates.length - 1] ?? params.dateTo,
    includedRows,
    rejectedRows,
    sourceRows,
  };
}

function DiagnosticCard({
  row,
  rejected = false,
  onSetVehicle,
  onExclude,
  onInclude,
  onRuleForDay,
  onSetRangeToDay,
}: {
  row: ImportDiagnosticRow;
  rejected?: boolean;
  onSetVehicle?: (row: ImportDiagnosticRow) => void;
  onExclude?: (row: ImportDiagnosticRow) => void;
  onInclude?: (row: ImportDiagnosticRow) => void;
  onRuleForDay?: (row: ImportDiagnosticRow) => void;
  onSetRangeToDay?: (row: ImportDiagnosticRow) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 text-xs space-y-1",
        rejected
          ? "border-red-500/25 bg-red-950/15"
          : "border-emerald-500/25 bg-emerald-950/15"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-white truncate">{row.orderNumber}</p>
          <p className="text-zinc-500 truncate">{row.route || "bez trasy"}</p>
        </div>
        <span className="shrink-0 text-zinc-300 tabular-nums">{isoToDisplay(row.date)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-zinc-400">
        <span className="truncate">{row.driverName || "brak kierowcy"}</span>
        <span className="text-right">{row.vehicleType || "brak typu"}</span>
        <span>{row.km} km</span>
        <span className="text-right font-semibold text-white">{formatZl(row.cost)}</span>
      </div>
      {row.notes && (
        <p className="text-zinc-400">
          Uwagi: <span className="text-zinc-300">{row.notes}</span>
        </p>
      )}
      <p className="text-zinc-500">
        Auto: {row.vehiclePlate ? `${row.vehiclePlate} · ` : ""}
        {carUsageLabel(row.vehicleOwner)}
        {row.manuallyOverridden ? " · ręczna korekta" : ""}
      </p>
      {row.vehicleRuleReason && (
        <p className="text-zinc-500">Reguła: {row.vehicleRuleReason}</p>
      )}
      <p className={cn("font-medium", rejected ? "text-red-300" : "text-emerald-300")}>
        {row.reason}
      </p>
      <div className="flex flex-wrap gap-1 pt-1">
        {onSetVehicle && (
          <button
            type="button"
            onClick={() => onSetVehicle(row)}
            className="rounded-full border border-line px-2 py-1 text-[10px] text-zinc-300 hover:border-amber-brand/60 hover:text-amber-300"
          >
            Zmień auto
          </button>
        )}
        {onExclude && (
          <button
            type="button"
            onClick={() => onExclude(row)}
            className="rounded-full border border-red-500/40 px-2 py-1 text-[10px] text-red-300 hover:bg-red-950/30"
          >
            Wyklucz
          </button>
        )}
        {onInclude && rejected && (
          <button
            type="button"
            onClick={() => onInclude(row)}
            className="rounded-full border border-emerald-500/40 px-2 py-1 text-[10px] text-emerald-300 hover:bg-emerald-950/30"
          >
            Uwzględnij mimo wszystko
          </button>
        )}
        {onRuleForDay && (
          <button
            type="button"
            onClick={() => onRuleForDay(row)}
            className="rounded-full border border-amber-500/40 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-950/30"
          >
            Reguła dnia
          </button>
        )}
        {onSetRangeToDay && row.date && (
          <button
            type="button"
            onClick={() => onSetRangeToDay(row)}
            className="rounded-full border border-line px-2 py-1 text-[10px] text-zinc-300 hover:border-amber-brand/60 hover:text-amber-300"
          >
            Zakres = dzień
          </button>
        )}
      </div>
    </div>
  );
}

export function ImportModal({
  mode = "confirm",
  invoiceNumber,
  filtered,
  message,
  fileName,
  isOverwrite = false,
  targetInfo,
  onConfirm,
  onCancel,
  onFilteredChange,
  onRemove,
  onReupload,
}: ImportModalProps) {
  const isPreview = mode === "preview";
  const [showRejected, setShowRejected] = useState(false);
  const [showVehicle, setShowVehicle] = useState(false);
  const [dateFrom, setDateFrom] = useState(filtered?.filters?.dateFrom ?? filtered?.zakresOd ?? "");
  const [dateTo, setDateTo] = useState(filtered?.filters?.dateTo ?? filtered?.zakresDo ?? "");
  const [manualDateRangeSelected, setManualDateRangeSelected] = useState(
    filtered?.manualDateRangeSelected ?? false
  );
  const [settlementVehicleMode, setSettlementVehicleMode] = useState<"none" | "plate">(
    filtered?.settlementVehicleMode ?? filtered?.filters?.settlementVehicleMode ?? "none"
  );
  const [settlementVehiclePlate, setSettlementVehiclePlate] = useState(
    filtered?.settlementVehiclePlate ?? filtered?.filters?.settlementVehiclePlate ?? ""
  );
  const [vehicleRules, setVehicleRules] = useState<VehicleAssignmentRule[]>(
    filtered?.vehicleAssignmentRules ?? []
  );
  const [recordOverrides, setRecordOverrides] = useState<RecordOverride[]>(
    filtered?.recordOverrides ?? []
  );
  const [ruleDraft, setRuleDraft] = useState({
    dateFrom: filtered?.filters?.dateFrom ?? filtered?.zakresOd ?? "",
    dateTo: filtered?.filters?.dateTo ?? filtered?.zakresDo ?? "",
    vehiclePlate: "KK9848Y",
    vehicleOwnerType: "driver_car" as ImportDiagnosticRow["vehicleOwner"],
    includeInSettlement: true,
    reason: "",
  });
  useAppBackLayer(true, "invoice-import-modal", onCancel, 80);

  // Zamknij modal klawiszem Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const noMatch = filtered === null;
  const driverName = filtered?.filters?.driverName || KIEROWCA;
  const vehicleType = filtered?.filters?.vehicleType || TYP_TRANSPORTU;
  const currentFiltered = useMemo(() => {
    if (!filtered) return null;
    return calculateFilteredResult(filtered, {
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      settlementVehicleMode,
      settlementVehiclePlate: settlementVehicleMode === "plate" ? settlementVehiclePlate.trim() || null : null,
      rules: vehicleRules,
      overrides: recordOverrides,
      manualDateRangeSelected,
    });
  }, [
    filtered,
    dateFrom,
    dateTo,
    settlementVehicleMode,
    settlementVehiclePlate,
    vehicleRules,
    recordOverrides,
    manualDateRangeSelected,
  ]);
  const includedRows = currentFiltered?.includedRows ?? [];
  const rejectedRows = currentFiltered?.rejectedRows ?? [];

  useEffect(() => {
    setDateFrom(filtered?.filters?.dateFrom ?? filtered?.zakresOd ?? "");
    setDateTo(filtered?.filters?.dateTo ?? filtered?.zakresDo ?? "");
    setManualDateRangeSelected(filtered?.manualDateRangeSelected ?? false);
    setSettlementVehicleMode(filtered?.settlementVehicleMode ?? filtered?.filters?.settlementVehicleMode ?? "none");
    setSettlementVehiclePlate(filtered?.settlementVehiclePlate ?? filtered?.filters?.settlementVehiclePlate ?? "");
    setVehicleRules(filtered?.vehicleAssignmentRules ?? []);
    setRecordOverrides(filtered?.recordOverrides ?? []);
    setRuleDraft({
      dateFrom: filtered?.filters?.dateFrom ?? filtered?.zakresOd ?? "",
      dateTo: filtered?.filters?.dateTo ?? filtered?.zakresDo ?? "",
      vehiclePlate: "KK9848Y",
      vehicleOwnerType: "driver_car",
      includeInSettlement: true,
      reason: "",
    });
  }, [
    fileName,
    invoiceNumber,
    mode,
    filtered?.filters?.dateFrom,
    filtered?.filters?.dateTo,
    filtered?.filters?.settlementVehicleMode,
    filtered?.filters?.settlementVehiclePlate,
    filtered?.manualDateRangeSelected,
    filtered?.recordOverrides,
    filtered?.settlementVehicleMode,
    filtered?.settlementVehiclePlate,
    filtered?.vehicleAssignmentRules,
    filtered?.zakresDo,
    filtered?.zakresOd,
  ]);

  useEffect(() => {
    if (currentFiltered) onFilteredChange?.(currentFiltered);
  }, [currentFiltered, onFilteredChange]);

  function addRuleFromDraft() {
    if (!ruleDraft.dateFrom || !ruleDraft.dateTo || !ruleDraft.vehiclePlate.trim()) {
      alert("Uzupełnij datę od, datę do i auto.");
      return;
    }
    setVehicleRules((prev) => [
      ...prev,
      {
        id: makeId(),
        driverName,
        dateFrom: ruleDraft.dateFrom,
        dateTo: ruleDraft.dateTo,
        vehiclePlate: ruleDraft.vehiclePlate.trim(),
        vehicleOwnerType: ruleDraft.vehicleOwnerType,
        includeInSettlement: ruleDraft.includeInSettlement,
        reason: ruleDraft.reason.trim() || undefined,
        active: true,
      },
    ]);
  }

  function setRowVehicle(row: ImportDiagnosticRow) {
    const plate = window.prompt("Wpisz numer auta dla tej pozycji:", row.vehiclePlate || settlementVehiclePlate || "KK9848Y");
    if (plate === null) return;
    setRecordOverrides((prev) => [
      ...prev.filter((o) => o.transportOrderId !== row.orderNumber),
      {
        transportOrderId: row.orderNumber,
        vehiclePlate: plate.trim() || undefined,
        includeInSettlement: true,
        manuallyOverridden: true,
      },
    ]);
  }

  function excludeRow(row: ImportDiagnosticRow) {
    const scope = window.prompt(
      "Wykluczyć: rekord, dzień czy zakres?",
      "rekord"
    )?.trim().toLowerCase();
    if (!scope) return;
    if (scope.startsWith("dzie") && row.date) {
      const rowDate = row.date;
      setVehicleRules((prev) => [
        ...prev,
        {
          id: makeId(),
          driverName: row.driverName,
          dateFrom: rowDate,
          dateTo: rowDate,
          vehiclePlate: row.vehiclePlate || settlementVehiclePlate || "inne auto",
          vehicleOwnerType: row.vehicleOwner,
          includeInSettlement: false,
          reason: "ręcznie wykluczony cały dzień",
          active: true,
        },
      ]);
      return;
    }
    if (scope.startsWith("zak")) {
      const from = window.prompt("Data od (YYYY-MM-DD):", dateFrom || row.date || "");
      const to = window.prompt("Data do (YYYY-MM-DD):", dateTo || row.date || "");
      if (!from || !to) return;
      setVehicleRules((prev) => [
        ...prev,
        {
          id: makeId(),
          driverName: row.driverName,
          dateFrom: from,
          dateTo: to,
          vehiclePlate: row.vehiclePlate || settlementVehiclePlate || "inne auto",
          vehicleOwnerType: row.vehicleOwner,
          includeInSettlement: false,
          reason: "ręcznie wykluczony zakres",
          active: true,
        },
      ]);
      return;
    }
    setRecordOverrides((prev) => [
      ...prev.filter((o) => o.transportOrderId !== row.orderNumber),
      {
        transportOrderId: row.orderNumber,
        vehiclePlate: row.vehiclePlate ?? undefined,
        includeInSettlement: false,
        exclusionReason: "ręcznie wykluczono z rozliczenia",
        manuallyOverridden: true,
      },
    ]);
  }

  function includeRow(row: ImportDiagnosticRow) {
    setRecordOverrides((prev) => [
      ...prev.filter((o) => o.transportOrderId !== row.orderNumber),
      {
        transportOrderId: row.orderNumber,
        vehiclePlate: row.vehiclePlate || settlementVehiclePlate || undefined,
        includeInSettlement: true,
        manuallyOverridden: true,
      },
    ]);
  }

  function addRuleForDay(row: ImportDiagnosticRow) {
    if (!row.date) return;
    const rowDate = row.date;
    setVehicleRules((prev) => [
      ...prev,
      {
        id: makeId(),
        driverName: row.driverName,
        dateFrom: rowDate,
        dateTo: rowDate,
        vehiclePlate: settlementVehiclePlate || row.vehiclePlate || "KK9848Y",
        vehicleOwnerType: settlementVehiclePlate ? "driver_car" : row.vehicleOwner,
        includeInSettlement: true,
        reason: `reguła dodana z pozycji ${row.orderNumber}`,
        active: true,
      },
    ]);
  }

  function setRangeToDay(row: ImportDiagnosticRow) {
    if (!row.date) return;
    setManualDateRangeSelected(true);
    setDateFrom(row.date);
    setDateTo(row.date);
  }

  return (
    // Tło nakładki
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      data-swipe-ignore="true"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-sm max-h-[92vh] bg-surface rounded-2xl border border-line shadow-2xl overflow-hidden flex flex-col">
        {/* Nagłówek */}
        <div className="px-5 py-4 border-b border-line bg-surface2 shrink-0">
          <h2 className="text-white font-semibold">
            {noMatch ? "Brak dopasowań" : "Podgląd importu PDF"}
          </h2>
          <span
            className="inline-block mt-0.5 text-xs text-zinc-400 hover:text-amber-400 underline decoration-dotted underline-offset-2 truncate max-w-full cursor-default"
            title={fileName}
          >
            📎 {fileName}
          </span>
          {invoiceNumber && (
            <p className="text-xs text-amber-400 mt-0.5">Faktura: {invoiceNumber}</p>
          )}
        </div>

        <div className="px-5 py-4 overflow-y-auto min-h-0">
          {noMatch ? (
            /* ── BRAK WYNIKÓW ── */
            <p className="text-zinc-300 text-sm leading-relaxed">
              {message ?? `W tym PDF nie znaleziono tras dla ${KIEROWCA} (${TYP_TRANSPORTU}).`}
            </p>
          ) : (
            /* ── WYNIKI ── */
            <div className="space-y-1">
              {message && (
                <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200 leading-relaxed">
                  {message}
                </p>
              )}
              <div className="text-xs text-zinc-500 space-y-0.5 mb-3">
                <p>Kierowca: <span className="text-zinc-300">{driverName}</span></p>
                <p>Typ transportu: <span className="text-zinc-300">{vehicleType}</span></p>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <label className="space-y-1 text-zinc-500">
                    <span>Data od</span>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => {
                        setManualDateRangeSelected(true);
                        setDateFrom(e.target.value);
                      }}
                      className="w-full rounded-lg border border-line bg-input px-2 py-2 text-sm text-white"
                    />
                  </label>
                  <label className="space-y-1 text-zinc-500">
                    <span>Data do</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => {
                        setManualDateRangeSelected(true);
                        setDateTo(e.target.value);
                      }}
                      className="w-full rounded-lg border border-line bg-input px-2 py-2 text-sm text-white"
                    />
                  </label>
                </div>
                {currentFiltered?.zakresOd && (
                  <p>
                    Zakres:{" "}
                    <span className="text-zinc-300">
                      {isoToDisplay(currentFiltered.zakresOd)} – {isoToDisplay(currentFiltered.zakresDo)}
                    </span>
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-line bg-surface2 p-3 space-y-2 mb-3">
                <button
                  type="button"
                  onClick={() => setShowVehicle((v) => !v)}
                  className="flex w-full items-center justify-between text-xs font-bold text-amber-300"
                >
                  <span>Auto i wykluczenia</span>
                  <span>{showVehicle ? "Ukryj" : "Pokaż"}</span>
                </button>
                <div className="grid grid-cols-1 gap-2">
                  <label className="text-xs text-zinc-500 space-y-1">
                    Rozliczane auto
                    <select
                      value={settlementVehicleMode}
                      onChange={(e) => setSettlementVehicleMode(e.target.value as "none" | "plate")}
                      className="w-full rounded-lg border border-line bg-input px-2 py-2 text-sm text-white"
                    >
                      <option value="none">Brak filtrowania po aucie</option>
                      <option value="plate">Filtruj po numerze auta</option>
                    </select>
                  </label>
                  {settlementVehicleMode === "plate" && (
                    <div className="space-y-2">
                      <input
                        value={settlementVehiclePlate}
                        onChange={(e) => setSettlementVehiclePlate(e.target.value.toUpperCase())}
                        placeholder="np. KK9848Y"
                        className="w-full rounded-lg border border-line bg-input px-2 py-2 text-sm text-white"
                      />
                      <div className="flex flex-wrap gap-1">
                        {["KK9848Y", "KK2063A"].map((plate) => (
                          <button
                            key={plate}
                            type="button"
                            onClick={() => setSettlementVehiclePlate(plate)}
                            className="rounded-full border border-amber-500/40 px-2 py-1 text-[10px] text-amber-300"
                          >
                            {plate}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {showVehicle && (
                  <div className="space-y-2 border-t border-line pt-2">
                    <p className="text-xs text-zinc-400">
                      Okresy auta / wykluczenia ({vehicleRules.length})
                    </p>
                    {vehicleRules.length > 0 && (
                      <div className="space-y-1">
                        {vehicleRules.map((rule) => (
                          <div key={rule.id} className="flex items-start justify-between gap-2 rounded-lg bg-input px-2 py-1.5 text-[11px] text-zinc-300">
                            <span>
                              {rule.dateFrom}–{rule.dateTo} · {rule.vehiclePlate} ·{" "}
                              {rule.includeInSettlement ? "liczyć" : "wykluczyć"}
                              {rule.reason ? ` · ${rule.reason}` : ""}
                            </span>
                            <button
                              type="button"
                              onClick={() => setVehicleRules((prev) => prev.filter((r) => r.id !== rule.id))}
                              className="text-red-300"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={ruleDraft.dateFrom}
                        onChange={(e) => setRuleDraft((p) => ({ ...p, dateFrom: e.target.value }))}
                        className="rounded-lg border border-line bg-input px-2 py-2 text-xs text-white"
                      />
                      <input
                        type="date"
                        value={ruleDraft.dateTo}
                        onChange={(e) => setRuleDraft((p) => ({ ...p, dateTo: e.target.value }))}
                        className="rounded-lg border border-line bg-input px-2 py-2 text-xs text-white"
                      />
                      <input
                        value={ruleDraft.vehiclePlate}
                        onChange={(e) => setRuleDraft((p) => ({ ...p, vehiclePlate: e.target.value.toUpperCase() }))}
                        placeholder="Auto"
                        className="rounded-lg border border-line bg-input px-2 py-2 text-xs text-white"
                      />
                      <select
                        value={ruleDraft.vehicleOwnerType}
                        onChange={(e) => setRuleDraft((p) => ({ ...p, vehicleOwnerType: e.target.value as ImportDiagnosticRow["vehicleOwner"] }))}
                        className="rounded-lg border border-line bg-input px-2 py-2 text-xs text-white"
                      >
                        <option value="driver_car">Auto kierowcy</option>
                        <option value="company_car">Auto Artura / firmowe</option>
                        <option value="replacement_car">Auto zastępcze</option>
                        <option value="unknown">Nieustalone</option>
                      </select>
                      <select
                        value={ruleDraft.includeInSettlement ? "yes" : "no"}
                        onChange={(e) => setRuleDraft((p) => ({ ...p, includeInSettlement: e.target.value === "yes" }))}
                        className="rounded-lg border border-line bg-input px-2 py-2 text-xs text-white"
                      >
                        <option value="yes">Liczyć do rozliczenia</option>
                        <option value="no">Nie liczyć</option>
                      </select>
                      <input
                        value={ruleDraft.reason}
                        onChange={(e) => setRuleDraft((p) => ({ ...p, reason: e.target.value }))}
                        placeholder="Powód"
                        className="rounded-lg border border-line bg-input px-2 py-2 text-xs text-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={addRuleFromDraft}
                      className="w-full rounded-xl border border-amber-500/50 px-3 py-2 text-xs font-bold text-amber-300"
                    >
                      + Dodaj regułę auta
                    </button>
                  </div>
                )}
              </div>

              <Row label="Kółka (trasy)" value={String(currentFiltered?.ileKolek ?? 0)} />
              {((currentFiltered?.ileZlecen ?? 0) > 0) && (
                <Row label="Zlecenia (z uwagą)" value={String(currentFiltered?.ileZlecen ?? 0)} />
              )}
              <Row label="Suma km" value={`${currentFiltered?.sumaKm ?? 0} km`} />
              <Row label="Średnia km/kółko" value={`${currentFiltered?.sredniaKm ?? 0} km`} />

              <div className="pt-1" />

              <Row label="Zarobek netto" value={formatZl(currentFiltered?.netto ?? 0)} />
              <Row label="Zarobek brutto" value={formatZl(currentFiltered?.brutto ?? 0)} accent />
              <Row label="Średnia netto/kółko" value={formatZl(currentFiltered?.sredniaNetto ?? 0)} />
              <Row label="Średnia brutto/kółko" value={formatZl(currentFiltered?.sredniaBrutto ?? 0)} />

              <div className="pt-3 space-y-2">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-xs font-bold text-emerald-300">
                      Pozycje uwzględnione ({includedRows.length})
                    </p>
                  </div>
                  <div className="space-y-2">
                    {includedRows.length > 0 ? (
                      includedRows.map((row) => (
                        <DiagnosticCard
                          key={`in-${row.orderNumber}-${row.date}`}
                          row={row}
                          onSetVehicle={setRowVehicle}
                          onExclude={excludeRow}
                          onRuleForDay={addRuleForDay}
                          onSetRangeToDay={setRangeToDay}
                        />
                      ))
                    ) : (
                      <p className="text-xs text-zinc-500">Brak pozycji uwzględnionych.</p>
                    )}
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setShowRejected((v) => !v)}
                    className="w-full flex items-center justify-between rounded-xl border border-line bg-surface2 px-3 py-2 text-xs text-zinc-300 hover:border-amber-brand/50 transition-colors"
                  >
                    <span>Pozycje odrzucone ({rejectedRows.length})</span>
                    <span className="text-amber-400">{showRejected ? "Ukryj" : "Pokaż"}</span>
                  </button>
                  {showRejected && (
                    <div className="mt-2 space-y-2">
                      {rejectedRows.length > 0 ? (
                        rejectedRows.map((row) => (
                          <DiagnosticCard
                            key={`out-${row.orderNumber}-${row.date}`}
                            row={row}
                            rejected
                            onSetVehicle={setRowVehicle}
                            onExclude={excludeRow}
                            onInclude={includeRow}
                            onRuleForDay={addRuleForDay}
                            onSetRangeToDay={setRangeToDay}
                          />
                        ))
                      ) : (
                        <p className="text-xs text-zinc-500">Brak pozycji odrzuconych.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {targetInfo && (
                <p className="mt-3 text-xs text-zinc-400">
                  Zapis do:{" "}
                  <span className="text-amber-400 font-medium">{targetInfo.label}</span>{" "}
                  <span className="text-zinc-500">
                    (tydzień {targetInfo.weekNumber}, {targetInfo.monthName.toLowerCase()})
                  </span>
                </p>
              )}

              {isPreview ? (
                <p className="mt-2 text-xs text-emerald-400 font-medium">
                  ✓ Import zapisany.
                </p>
              ) : (
                isOverwrite && (
                  <p className="mt-2 text-xs text-amber-400 font-medium">
                    ⚠ Zastąpi poprzedni import dla tego tygodnia.
                  </p>
                )
              )}
            </div>
          )}
        </div>

        {/* Przyciski */}
        {noMatch ? (
          <div className="px-5 pb-5 shrink-0">
            <button
              onClick={onCancel}
              className="w-full py-2.5 rounded-xl bg-zinc-700 text-white font-medium text-sm hover:bg-zinc-600 transition-colors"
            >
              OK
            </button>
          </div>
        ) : isPreview ? (
          <div className="px-5 pb-5 flex flex-col gap-2 shrink-0">
            <button
              onClick={onReupload}
              className="w-full py-2.5 rounded-xl bg-amber-brand text-amber-ink font-bold text-sm hover:bg-[#e09420] transition-colors"
            >
              Wgraj inny PDF
            </button>
            <div className="flex gap-2">
              <button
                onClick={onCancel}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 font-medium text-sm hover:bg-zinc-700 transition-colors"
              >
                Zamknij
              </button>
              <button
                onClick={onRemove}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-red-400 font-medium text-sm hover:bg-red-950/40 hover:text-red-300 transition-colors"
              >
                Usuń import
              </button>
            </div>
          </div>
        ) : (
          <div className="px-5 pb-5 flex gap-3 shrink-0">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 font-medium text-sm hover:bg-zinc-700 transition-colors"
            >
              Anuluj
            </button>
            <button
              onClick={() => onConfirm(currentFiltered)}
              className="flex-1 py-2.5 rounded-xl bg-amber-brand text-amber-ink font-bold text-sm hover:bg-[#e09420] transition-colors"
            >
              Zapisz do tygodnia
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
