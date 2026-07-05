"use client";

// Modal importu PDF: podgląd, korekta zakresu dat, komentarz i dodatki ręczne.

import { useEffect, useMemo, useState } from "react";
import { KIEROWCA, TYP_TRANSPORTU, VAT } from "@/lib/config";
import { formatZl } from "@/lib/business-logic";
import { cn } from "@/lib/utils";
import { useAppBackLayer } from "@/lib/mobile-navigation";
import type { PDFManualAddition, PDFManualAdditionType } from "@/lib/types";

interface ImportFilterInfo {
  driverName: string;
  vehicleType: string;
  dateFrom: string | null;
  dateTo: string | null;
  // Legacy fields kept only for old saved imports. The UI no longer filters by vehicle.
  settlementVehiclePlate?: string | null;
  settlementVehicleMode?: "none" | "plate";
}

interface RecordOverride {
  transportOrderId: string;
  includeInSettlement: boolean;
  exclusionReason?: string;
  manuallyOverridden: boolean;
  vehiclePlate?: string;
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
  isAdditional?: boolean;
  reason: string;
  rawText?: string;
  // Legacy fields may exist in old JSON, but are intentionally not displayed.
  vehicleOwner: "driver_car" | "company_car" | "replacement_car" | "unknown";
  vehiclePlate?: string | null;
  vehicleRuleReason?: string;
  manuallyOverridden?: boolean;
}

interface FilteredResult {
  filters?: ImportFilterInfo;
  ileKolek: number;
  ileZlecen?: number;
  kolkaNetto?: number;
  kolkaBrutto?: number;
  zleceniaNetto?: number;
  zleceniaBrutto?: number;
  sumaKm: number;
  netto: number;
  brutto: number;
  sredniaKm: number;
  sredniaNetto: number;
  sredniaBrutto: number;
  zakresOd: string | null;
  zakresDo: string | null;
  includedRows?: ImportDiagnosticRow[];
  rejectedRows?: ImportDiagnosticRow[];
  sourceRows?: ImportDiagnosticRow[];
  recordOverrides?: RecordOverride[];
  invoiceImportDateFrom?: string | null;
  invoiceImportDateTo?: string | null;
  manualDateRangeSelected?: boolean;
  komentarz?: string;
  dodatkiReczne?: PDFManualAddition[];
  courseNetto?: number;
  courseBrutto?: number;
  manualAdditionsNetto?: number;
  manualAdditionsBrutto?: number;
  totalNetto?: number;
  totalBrutto?: number;
  // Legacy fields kept for type compatibility with older saved imports.
  vehicleAssignmentRules?: unknown[];
  settlementVehiclePlate?: string | null;
  settlementVehicleMode?: "none" | "plate";
}

export interface ImportModalProps {
  mode?: "preview" | "confirm";
  invoiceNumber: string | null;
  filtered: FilteredResult | null;
  message?: string;
  fileName: string;
  isOverwrite?: boolean;
  targetInfo?: { label: string; weekNumber: number; monthName: string };
  onConfirm: (filtered?: FilteredResult | null) => void;
  onCancel: () => void;
  onFilteredChange?: (filtered: FilteredResult) => void;
  onRemove?: () => void;
  onReupload?: () => void;
}

const ADDITION_TYPES: { value: PDFManualAdditionType; label: string }[] = [
  { value: "niedziela", label: "Niedziela" },
  { value: "swieto", label: "Święto" },
  { value: "dodatkowy_kurs", label: "Dodatkowy kurs" },
  { value: "doplata", label: "Dopłata" },
  { value: "korekta", label: "Korekta" },
  { value: "inny", label: "Inny" },
];

interface AdditionDraft {
  type: PDFManualAdditionType;
  date: string;
  driverName: string;
  netto: string;
  vatRate: string;
  vatAmount: string;
  brutto: string;
  description: string;
  addToInvoice: boolean;
  addToDriverSettlement: boolean;
}

function isoToDisplay(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

function parseNum(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "").replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `add-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sourceRowsOf(filtered: FilteredResult): ImportDiagnosticRow[] {
  return filtered.sourceRows && filtered.sourceRows.length > 0
    ? filtered.sourceRows
    : [...(filtered.includedRows ?? []), ...(filtered.rejectedRows ?? [])];
}

function defaultRangeForRows(
  rows: ImportDiagnosticRow[],
  driverName: string,
  vehicleType: string
): { from: string; to: string } {
  const dates = rows
    .filter(
      (row) =>
        normalizeText(row.driverName) === normalizeText(driverName) &&
        normalizeText(row.vehicleType) === normalizeText(vehicleType) &&
        !!row.date
    )
    .map((row) => row.date as string)
    .sort();
  return { from: dates[0] ?? "", to: dates[dates.length - 1] ?? "" };
}

function additionTypeLabel(type: PDFManualAdditionType): string {
  return ADDITION_TYPES.find((item) => item.value === type)?.label ?? "Inny";
}

function defaultAdditionDraft(driverName: string, date: string): AdditionDraft {
  return {
    type: "niedziela",
    date,
    driverName,
    netto: "",
    vatRate: String(VAT),
    vatAmount: "",
    brutto: "",
    description: "Dodatek za niedzielę",
    addToInvoice: true,
    addToDriverSettlement: false,
  };
}

function Row({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-3 py-1.5 border-b border-zinc-800 last:border-0">
      <span className={cn("text-sm", accent ? "font-semibold text-white" : "text-zinc-400")}>
        {label}
      </span>
      <span className={cn("tabular-nums text-sm font-medium text-right", accent ? "text-amber-400 text-base font-bold" : "text-white")}>
        {value}
      </span>
    </div>
  );
}

function calculateFilteredResult(
  base: FilteredResult,
  params: {
    dateFrom: string | null;
    dateTo: string | null;
    overrides: RecordOverride[];
    manualDateRangeSelected: boolean;
    comment: string;
    additions: PDFManualAddition[];
  }
): FilteredResult {
  const sourceRows = sourceRowsOf(base);
  if (sourceRows.length === 0) return base;

  const driverName = base.filters?.driverName || KIEROWCA;
  const vehicleType = base.filters?.vehicleType || TYP_TRANSPORTU;
  const includedRows: ImportDiagnosticRow[] = [];
  const rejectedRows: ImportDiagnosticRow[] = [];
  const dateRejectReason = params.comment.trim()
    ? "Poza wybranym zakresem dat — patrz komentarz do rozliczenia."
    : "poza wybranym zakresem dat";

  for (const row of sourceRows) {
    const reasons: string[] = [];
    if (!row.date) reasons.push("brak daty");
    if (row.cost <= 0) reasons.push("brak kwoty");
    if (normalizeText(row.driverName) !== normalizeText(driverName)) reasons.push("inny kierowca");
    if (normalizeText(row.vehicleType) !== normalizeText(vehicleType)) reasons.push("inny typ transportu");
    if (params.dateFrom && row.date && row.date < params.dateFrom) reasons.push(dateRejectReason);
    if (params.dateTo && row.date && row.date > params.dateTo) reasons.push(dateRejectReason);

    const override = params.overrides.find((o) => o.transportOrderId === row.orderNumber);
    const nextRow: ImportDiagnosticRow = {
      ...row,
      vehicleOwner: row.vehicleOwner ?? "unknown",
      manuallyOverridden: !!override || row.manuallyOverridden,
    };

    if (override && !override.includeInSettlement) {
      reasons.push(override.exclusionReason || "ręcznie wykluczone");
    }

    const uniqueReasons = Array.from(new Set(reasons));
    if (uniqueReasons.length === 0) {
      includedRows.push({
        ...nextRow,
        reason: row.isAdditional
          ? "zgodny kierowca, typ i zakres dat; zlecenie z uwagą"
          : "zgodny kierowca, typ i zakres dat",
      });
    } else {
      rejectedRows.push({ ...nextRow, reason: uniqueReasons.join(", ") });
    }
  }

  const totalRows = includedRows.length;
  const zleceniaRows = includedRows.filter((row) => row.isAdditional || !!row.notes.trim());
  const kolkaRows = includedRows.filter((row) => !(row.isAdditional || !!row.notes.trim()));
  const ileZlecen = zleceniaRows.length;
  const ileKolek = kolkaRows.length;
  const sumaKm = includedRows.reduce((sum, row) => sum + row.km, 0);
  const kolkaNetto = round2(kolkaRows.reduce((sum, row) => sum + row.cost, 0));
  const zleceniaNetto = round2(zleceniaRows.reduce((sum, row) => sum + row.cost, 0));
  const kolkaBrutto = round2(kolkaNetto * (1 + VAT));
  const zleceniaBrutto = round2(zleceniaNetto * (1 + VAT));
  const courseNetto = round2(includedRows.reduce((sum, row) => sum + row.cost, 0));
  const courseBrutto = round2(courseNetto * (1 + VAT));
  const invoiceAdditions = params.additions.filter((addition) => addition.addToInvoice);
  const manualAdditionsNetto = round2(invoiceAdditions.reduce((sum, addition) => sum + addition.netto, 0));
  const manualAdditionsBrutto = round2(invoiceAdditions.reduce((sum, addition) => sum + addition.brutto, 0));
  const totalNetto = round2(courseNetto + manualAdditionsNetto);
  const totalBrutto = round2(courseBrutto + manualAdditionsBrutto);
  const dates = includedRows.map((row) => row.date).filter((date): date is string => !!date).sort();

  return {
    ...base,
    filters: {
      driverName,
      vehicleType,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      settlementVehicleMode: "none",
      settlementVehiclePlate: null,
    },
    invoiceImportDateFrom: params.dateFrom,
    invoiceImportDateTo: params.dateTo,
    manualDateRangeSelected: params.manualDateRangeSelected,
    settlementVehicleMode: "none",
    settlementVehiclePlate: null,
    recordOverrides: params.overrides,
    komentarz: params.comment,
    dodatkiReczne: params.additions,
    courseNetto,
    courseBrutto,
    manualAdditionsNetto,
    manualAdditionsBrutto,
    totalNetto,
    totalBrutto,
    ileKolek,
    ileZlecen,
    kolkaNetto,
    kolkaBrutto,
    zleceniaNetto,
    zleceniaBrutto,
    sumaKm,
    netto: totalNetto,
    brutto: totalBrutto,
    sredniaKm: totalRows > 0 ? round2(sumaKm / totalRows) : 0,
    // Średnie liczymy tylko od kursów, żeby dodatki ręczne nie udawały kółek.
    sredniaNetto: totalRows > 0 ? round2(courseNetto / totalRows) : 0,
    sredniaBrutto: totalRows > 0 ? round2(courseBrutto / totalRows) : 0,
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
  onExclude,
  onRestore,
}: {
  row: ImportDiagnosticRow;
  rejected?: boolean;
  onExclude?: (row: ImportDiagnosticRow) => void;
  onRestore?: (row: ImportDiagnosticRow) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 text-xs space-y-1",
        rejected ? "border-red-500/25 bg-red-950/15" : "border-emerald-500/25 bg-emerald-950/15"
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
      <p className={cn("font-medium", rejected ? "text-red-300" : "text-emerald-300")}>
        {row.reason}
      </p>
      <div className="flex flex-wrap gap-1 pt-1">
        {onExclude && !rejected && (
          <button
            type="button"
            onClick={() => onExclude(row)}
            className="rounded-full border border-red-500/40 px-2 py-1 text-[10px] text-red-300 hover:bg-red-950/30"
          >
            Wyklucz
          </button>
        )}
        {onRestore && rejected && row.manuallyOverridden && (
          <button
            type="button"
            onClick={() => onRestore(row)}
            className="rounded-full border border-emerald-500/40 px-2 py-1 text-[10px] text-emerald-300 hover:bg-emerald-950/30"
          >
            Przywróć do rozliczenia
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
  const driverName = filtered?.filters?.driverName || KIEROWCA;
  const vehicleType = filtered?.filters?.vehicleType || TYP_TRANSPORTU;
  const sourceRows = filtered ? sourceRowsOf(filtered) : [];
  const fullRange = filtered ? defaultRangeForRows(sourceRows, driverName, vehicleType) : { from: "", to: "" };

  const [showRejected, setShowRejected] = useState(false);
  const [showAdditionForm, setShowAdditionForm] = useState(false);
  const [dateFrom, setDateFrom] = useState(filtered?.filters?.dateFrom ?? filtered?.zakresOd ?? fullRange.from);
  const [dateTo, setDateTo] = useState(filtered?.filters?.dateTo ?? filtered?.zakresDo ?? fullRange.to);
  const [manualDateRangeSelected, setManualDateRangeSelected] = useState(filtered?.manualDateRangeSelected ?? false);
  const [recordOverrides, setRecordOverrides] = useState<RecordOverride[]>(filtered?.recordOverrides ?? []);
  const [comment, setComment] = useState(filtered?.komentarz ?? "");
  const [manualAdditions, setManualAdditions] = useState<PDFManualAddition[]>(filtered?.dodatkiReczne ?? []);
  const [additionDraft, setAdditionDraft] = useState<AdditionDraft>(
    defaultAdditionDraft(driverName, filtered?.zakresDo ?? fullRange.to)
  );

  useAppBackLayer(true, "invoice-import-modal", onCancel, 80);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  useEffect(() => {
    if (!filtered) return;
    const nextSource = sourceRowsOf(filtered);
    const nextRange = defaultRangeForRows(
      nextSource,
      filtered.filters?.driverName || KIEROWCA,
      filtered.filters?.vehicleType || TYP_TRANSPORTU
    );
    setDateFrom(filtered.filters?.dateFrom ?? filtered.invoiceImportDateFrom ?? filtered.zakresOd ?? nextRange.from);
    setDateTo(filtered.filters?.dateTo ?? filtered.invoiceImportDateTo ?? filtered.zakresDo ?? nextRange.to);
    setManualDateRangeSelected(filtered.manualDateRangeSelected ?? false);
    setRecordOverrides(filtered.recordOverrides ?? []);
    setComment(filtered.komentarz ?? "");
    setManualAdditions(filtered.dodatkiReczne ?? []);
    setAdditionDraft(defaultAdditionDraft(filtered.filters?.driverName || KIEROWCA, filtered.zakresDo ?? nextRange.to));
  }, [filtered, fileName, invoiceNumber, mode]);

  const currentFiltered = useMemo(() => {
    if (!filtered) return null;
    return calculateFilteredResult(filtered, {
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      overrides: recordOverrides,
      manualDateRangeSelected,
      comment,
      additions: manualAdditions,
    });
  }, [filtered, dateFrom, dateTo, recordOverrides, manualDateRangeSelected, comment, manualAdditions]);

  useEffect(() => {
    if (currentFiltered) onFilteredChange?.(currentFiltered);
  }, [currentFiltered, onFilteredChange]);

  const noMatch = filtered === null;
  const includedRows = currentFiltered?.includedRows ?? [];
  const rejectedRows = currentFiltered?.rejectedRows ?? [];
  const shorterThanFullRange =
    !!filtered &&
    manualDateRangeSelected &&
    !!fullRange.from &&
    !!fullRange.to &&
    (dateFrom !== fullRange.from || dateTo !== fullRange.to);

  function setDraftFromNetto(value: string) {
    const netto = parseNum(value);
    const vatRate = parseNum(additionDraft.vatRate);
    const vatAmount = round2(netto * vatRate);
    const brutto = round2(netto + vatAmount);
    setAdditionDraft((prev) => ({
      ...prev,
      netto: value,
      vatAmount: vatAmount ? String(vatAmount).replace(".", ",") : "",
      brutto: brutto ? String(brutto).replace(".", ",") : "",
    }));
  }

  function setDraftFromBrutto(value: string) {
    const brutto = parseNum(value);
    const vatRate = parseNum(additionDraft.vatRate);
    const netto = vatRate >= 0 ? round2(brutto / (1 + vatRate)) : brutto;
    const vatAmount = round2(brutto - netto);
    setAdditionDraft((prev) => ({
      ...prev,
      brutto: value,
      netto: netto ? String(netto).replace(".", ",") : "",
      vatAmount: vatAmount ? String(vatAmount).replace(".", ",") : "",
    }));
  }

  function setDraftVatRate(value: string) {
    const netto = parseNum(additionDraft.netto);
    const vatRate = parseNum(value);
    const vatAmount = round2(netto * vatRate);
    const brutto = round2(netto + vatAmount);
    setAdditionDraft((prev) => ({
      ...prev,
      vatRate: value,
      vatAmount: vatAmount ? String(vatAmount).replace(".", ",") : "",
      brutto: brutto ? String(brutto).replace(".", ",") : prev.brutto,
    }));
  }

  function addManualAddition() {
    const netto = round2(parseNum(additionDraft.netto));
    const vatRate = parseNum(additionDraft.vatRate);
    const vatAmount = round2(parseNum(additionDraft.vatAmount));
    const brutto = round2(parseNum(additionDraft.brutto));
    if (!additionDraft.date || brutto <= 0) {
      alert("Uzupełnij datę dodatku i kwotę brutto.");
      return;
    }

    const next: PDFManualAddition = {
      id: makeId(),
      type: additionDraft.type,
      date: additionDraft.date,
      driverName: additionDraft.driverName.trim() || driverName,
      netto: netto || round2(brutto / (1 + vatRate)),
      vatRate,
      vatAmount: vatAmount || round2(brutto - brutto / (1 + vatRate)),
      brutto,
      description: additionDraft.description.trim() || undefined,
      addToInvoice: additionDraft.addToInvoice,
      addToDriverSettlement: additionDraft.addToDriverSettlement,
    };

    setManualAdditions((prev) => [...prev, next]);
    setAdditionDraft(defaultAdditionDraft(driverName, additionDraft.date));
    setShowAdditionForm(false);
  }

  function excludeRow(row: ImportDiagnosticRow) {
    const reason = window.prompt(
      "Powód wykluczenia",
      row.reason.includes("poza") ? "poza wybranym zakresem dat" : "jechał autem Artura"
    );
    if (reason === null) return;
    setRecordOverrides((prev) => [
      ...prev.filter((override) => override.transportOrderId !== row.orderNumber),
      {
        transportOrderId: row.orderNumber,
        includeInSettlement: false,
        exclusionReason: reason.trim() || "ręcznie wykluczone",
        manuallyOverridden: true,
      },
    ]);
  }

  function restoreRow(row: ImportDiagnosticRow) {
    setRecordOverrides((prev) => prev.filter((override) => override.transportOrderId !== row.orderNumber));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      data-swipe-ignore="true"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-sm max-h-[92vh] bg-surface rounded-2xl border border-line shadow-2xl overflow-hidden flex flex-col">
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
            <p className="text-zinc-300 text-sm leading-relaxed">
              {message ?? `W tym PDF nie znaleziono tras dla ${KIEROWCA} (${TYP_TRANSPORTU}).`}
            </p>
          ) : (
            <div className="space-y-4">
              {message && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200 leading-relaxed">
                  {message}
                </p>
              )}

              <section className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-400">Dane faktury</p>
                <div className="text-xs text-zinc-500 space-y-0.5">
                  <p>Kierowca: <span className="text-zinc-300">{driverName}</span></p>
                  <p>Typ transportu: <span className="text-zinc-300">{vehicleType}</span></p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-xs text-zinc-500">
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
                  <label className="space-y-1 text-xs text-zinc-500">
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
                {shorterThanFullRange && (
                  <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
                    Wybrano tylko część faktury. Możesz dodać komentarz, dlaczego nie liczysz całego okresu.
                  </p>
                )}
              </section>

              <section className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wide text-amber-400">
                  Komentarz do rozliczenia
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  placeholder="Np. Nie liczymy całej faktury, bo w dniach 08–10.06 kierowca jeździł autem Artura."
                  className="w-full rounded-xl border border-line bg-input px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20"
                />
              </section>

              <section className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-400">Podsumowanie</p>
                {(() => {
                  // Rozbicie kółka/zlecenia — dla starych importów bez zapisanych
                  // sum liczymy je z pozycji uwzględnionych.
                  const rows = currentFiltered?.includedRows ?? [];
                  const jestZlecenie = (r: ImportDiagnosticRow) => !!r.isAdditional || !!(r.notes ?? "").trim();
                  const zlecRows = rows.filter(jestZlecenie);
                  const kolkaNetto =
                    currentFiltered?.kolkaNetto ??
                    round2(rows.filter((r) => !jestZlecenie(r)).reduce((s, r) => s + r.cost, 0));
                  const zleceniaNetto =
                    currentFiltered?.zleceniaNetto ?? round2(zlecRows.reduce((s, r) => s + r.cost, 0));
                  const kolkaBrutto = currentFiltered?.kolkaBrutto ?? round2(kolkaNetto * (1 + VAT));
                  const zleceniaBrutto = currentFiltered?.zleceniaBrutto ?? round2(zleceniaNetto * (1 + VAT));
                  const ileZlecen = currentFiltered?.ileZlecen ?? zlecRows.length;
                  return (
                    <>
                      <Row label="Kółka (trasy)" value={String(currentFiltered?.ileKolek ?? 0)} />
                      <Row label="Kółka netto" value={formatZl(kolkaNetto)} />
                      <Row label="Kółka brutto" value={formatZl(kolkaBrutto)} />
                      <Row label="Zlecenia (z uwagą)" value={String(ileZlecen)} />
                      <Row label="Zlecenia netto" value={formatZl(zleceniaNetto)} />
                      <Row label="Zlecenia brutto" value={formatZl(zleceniaBrutto)} />
                    </>
                  );
                })()}
                <Row label="Suma km" value={`${currentFiltered?.sumaKm ?? 0} km`} />
                <Row label="Suma z kursów netto" value={formatZl(currentFiltered?.courseNetto ?? currentFiltered?.netto ?? 0)} />
                <Row label="Suma z kursów brutto" value={formatZl(currentFiltered?.courseBrutto ?? currentFiltered?.brutto ?? 0)} />
                <Row label="Dodatki ręczne netto" value={formatZl(currentFiltered?.manualAdditionsNetto ?? 0)} />
                <Row label="Dodatki ręczne brutto" value={formatZl(currentFiltered?.manualAdditionsBrutto ?? 0)} />
                <Row label="Razem netto" value={formatZl(currentFiltered?.totalNetto ?? currentFiltered?.netto ?? 0)} />
                <Row label="Razem brutto" value={formatZl(currentFiltered?.totalBrutto ?? currentFiltered?.brutto ?? 0)} accent />
                <Row label="Średnia netto/kółko" value={formatZl(currentFiltered?.sredniaNetto ?? 0)} />
                <Row label="Średnia brutto/kółko" value={formatZl(currentFiltered?.sredniaBrutto ?? 0)} />
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-400">
                    Dodatki ręczne ({manualAdditions.length})
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowAdditionForm((value) => !value)}
                    className="rounded-full border border-amber-500/50 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-950/20"
                  >
                    + Dodaj dodatek
                  </button>
                </div>

                {manualAdditions.length > 0 && (
                  <div className="space-y-2">
                    {manualAdditions.map((addition) => (
                      <div key={addition.id} className="rounded-xl border border-line bg-surface2 p-3 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-bold text-white">{additionTypeLabel(addition.type)}</p>
                            <p className="text-zinc-500">{isoToDisplay(addition.date)} · {addition.driverName}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setManualAdditions((prev) => prev.filter((item) => item.id !== addition.id))}
                            className="text-red-300 hover:text-red-200"
                          >
                            ×
                          </button>
                        </div>
                        <p className="mt-1 text-zinc-300">{addition.description || "Bez opisu"}</p>
                        <p className="mt-1 text-amber-300 font-bold tabular-nums">{formatZl(addition.brutto)} brutto</p>
                        <p className="text-zinc-500">
                          Faktura: {addition.addToInvoice ? "tak" : "nie"} · Rozliczenie kierowcy: {addition.addToDriverSettlement ? "tak" : "nie"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {showAdditionForm && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-zinc-500 space-y-1">
                        Typ dodatku
                        <select
                          value={additionDraft.type}
                          onChange={(e) => setAdditionDraft((prev) => ({
                            ...prev,
                            type: e.target.value as PDFManualAdditionType,
                            description: e.target.value === "niedziela" ? "Dodatek za niedzielę" : prev.description,
                          }))}
                          className="w-full rounded-lg border border-line bg-input px-2 py-2 text-sm text-white"
                        >
                          {ADDITION_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-zinc-500 space-y-1">
                        Data dodatku
                        <input
                          type="date"
                          value={additionDraft.date}
                          onChange={(e) => setAdditionDraft((prev) => ({ ...prev, date: e.target.value }))}
                          className="w-full rounded-lg border border-line bg-input px-2 py-2 text-sm text-white"
                        />
                      </label>
                    </div>
                    <label className="text-xs text-zinc-500 space-y-1 block">
                      Kierowca
                      <input
                        value={additionDraft.driverName}
                        onChange={(e) => setAdditionDraft((prev) => ({ ...prev, driverName: e.target.value }))}
                        className="w-full rounded-lg border border-line bg-input px-2 py-2 text-sm text-white"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-zinc-500 space-y-1">
                        Kwota netto
                        <input
                          inputMode="decimal"
                          value={additionDraft.netto}
                          onChange={(e) => setDraftFromNetto(e.target.value)}
                          className="w-full rounded-lg border border-line bg-input px-2 py-2 text-sm text-white"
                        />
                      </label>
                      <label className="text-xs text-zinc-500 space-y-1">
                        VAT %
                        <select
                          value={additionDraft.vatRate}
                          onChange={(e) => setDraftVatRate(e.target.value)}
                          className="w-full rounded-lg border border-line bg-input px-2 py-2 text-sm text-white"
                        >
                          <option value="0.23">23%</option>
                          <option value="0.08">8%</option>
                          <option value="0.05">5%</option>
                          <option value="0">0%</option>
                        </select>
                      </label>
                      <label className="text-xs text-zinc-500 space-y-1">
                        Kwota VAT
                        <input
                          inputMode="decimal"
                          value={additionDraft.vatAmount}
                          onChange={(e) => setAdditionDraft((prev) => ({ ...prev, vatAmount: e.target.value }))}
                          className="w-full rounded-lg border border-line bg-input px-2 py-2 text-sm text-white"
                        />
                      </label>
                      <label className="text-xs text-zinc-500 space-y-1">
                        Kwota brutto
                        <input
                          inputMode="decimal"
                          value={additionDraft.brutto}
                          onChange={(e) => setDraftFromBrutto(e.target.value)}
                          className="w-full rounded-lg border border-line bg-input px-2 py-2 text-sm text-white"
                        />
                      </label>
                    </div>
                    <label className="text-xs text-zinc-500 space-y-1 block">
                      Opis
                      <input
                        value={additionDraft.description}
                        onChange={(e) => setAdditionDraft((prev) => ({ ...prev, description: e.target.value }))}
                        placeholder="np. Dodatek za niedzielę"
                        className="w-full rounded-lg border border-line bg-input px-2 py-2 text-sm text-white"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-zinc-300">
                      <input
                        type="checkbox"
                        checked={additionDraft.addToInvoice}
                        onChange={(e) => setAdditionDraft((prev) => ({ ...prev, addToInvoice: e.target.checked }))}
                        className="accent-amber-brand"
                      />
                      Doliczyć do faktury
                    </label>
                    <label className="flex items-center gap-2 text-xs text-zinc-300">
                      <input
                        type="checkbox"
                        checked={additionDraft.addToDriverSettlement}
                        onChange={(e) => setAdditionDraft((prev) => ({ ...prev, addToDriverSettlement: e.target.checked }))}
                        className="accent-amber-brand"
                      />
                      Doliczyć do rozliczenia kierowcy
                    </label>
                    <button
                      type="button"
                      onClick={addManualAddition}
                      className="w-full rounded-xl bg-amber-brand px-3 py-2 text-sm font-bold text-amber-ink hover:bg-[#e09420]"
                    >
                      Dodaj dodatek
                    </button>
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <p className="text-xs font-bold text-emerald-300">
                  Pozycje uwzględnione ({includedRows.length})
                </p>
                <div className="space-y-2">
                  {includedRows.length > 0 ? (
                    includedRows.map((row) => (
                      <DiagnosticCard
                        key={`in-${row.orderNumber}-${row.date}`}
                        row={row}
                        onExclude={excludeRow}
                      />
                    ))
                  ) : (
                    <p className="text-xs text-zinc-500">Brak pozycji uwzględnionych.</p>
                  )}
                </div>
              </section>

              <section>
                <button
                  type="button"
                  onClick={() => setShowRejected((value) => !value)}
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
                          onRestore={restoreRow}
                        />
                      ))
                    ) : (
                      <p className="text-xs text-zinc-500">Brak pozycji odrzuconych.</p>
                    )}
                  </div>
                )}
              </section>

              {targetInfo && (
                <p className="text-xs text-zinc-400">
                  Zapis do:{" "}
                  <span className="text-amber-400 font-medium">{targetInfo.label}</span>{" "}
                  <span className="text-zinc-500">
                    (tydzień {targetInfo.weekNumber}, {targetInfo.monthName.toLowerCase()})
                  </span>
                </p>
              )}

              {isPreview ? (
                <p className="text-xs text-emerald-400 font-medium">✓ Import zapisany.</p>
              ) : (
                isOverwrite && (
                  <p className="text-xs text-amber-400 font-medium">
                    ⚠ Zastąpi poprzedni import dla tego tygodnia.
                  </p>
                )
              )}
            </div>
          )}
        </div>

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
              onClick={() => onConfirm(currentFiltered)}
              className="w-full py-2.5 rounded-xl bg-amber-brand text-amber-ink font-bold text-sm hover:bg-[#e09420] transition-colors"
            >
              Zapisz zmiany
            </button>
            <button
              onClick={onReupload}
              className="w-full py-2.5 rounded-xl border border-amber-brand/50 text-amber-brand font-bold text-sm hover:bg-amber-brand/10 transition-colors"
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
