"use client";

// Zakładka Zarobek — faktury tygodniowe + import PDF

import { useRef, useState, useMemo } from "react";
import { DaneMiesiaca, FakturaWeek, InvoiceStatus, MiesiącId, PDFImportData } from "@/lib/types";
import { logChange } from "@/lib/audit";
import { obliczPrzychod, formatZlCaly, formatZl, parseNum } from "@/lib/business-logic";
import {
  getWeeksOfMonth,
  findBestWeekForRange,
  formatRangeShort,
  formatRangeLabel,
  toISODate,
  POLSKIE_MIESIACE,
} from "@/lib/dates";
import { KIEROWCA, TYP_TRANSPORTU } from "@/lib/config";
import { NumInput } from "../ui/NumInput";
import { CardTitle } from "../ui/Card";
import { IconPaperclip, IconCheck, IconX, IconLoader } from "../ui/icons";
import { ImportModal, ImportModalProps } from "../ImportModal";
import {
  createAdditionalInvoiceId,
  isEmptyInvoiceSlot,
  normalizeMonthInvoices,
} from "@/lib/invoice-weeks";

interface Props {
  miesiac: MiesiącId;
  dane: DaneMiesiaca;
  onUpdate: (updater: (prev: DaneMiesiaca) => DaneMiesiaca) => void;
  token: string;
  userName: string;
}

interface ModalState {
  mode: "preview" | "confirm";
  fakturaId: string;
  fileName: string;
  invoiceNumber: string | null;
  filtered: ImportModalProps["filtered"];
  message?: string;
  isOverwrite: boolean;
  // Auto-wybrany tydzień docelowy (na podstawie dat z PDF)
  targetIdx: number;
  targetRecordId: string | null;
  replaceExisting: boolean;
  targetLabel: string;
  targetWeekNumber: number;
  monthName: string;
  customRange: { od: string; do: string } | null;
}

// Kolory i etykiety statusów faktur
const STATUSY: { id: InvoiceStatus; label: string; cls: string }[] = [
  { id: "do_wystawienia", label: "do wystawienia", cls: "text-dim border-line" },
  { id: "wystawiona", label: "wystawiona", cls: "text-blue-300 border-blue-500/40" },
  { id: "wyslana", label: "wysłana", cls: "text-purple-300 border-purple-500/40" },
  { id: "oplacona", label: "opłacona", cls: "text-green-300 border-green-500/40" },
  { id: "opozniona", label: "opóźniona", cls: "text-red-300 border-red-500/40" },
];

// Termin płatności: data wystawienia + 21 dni → "DD.MM.YYYY"
function terminPlatnosci(issueDate: string): string {
  const d = new Date(issueDate + "T12:00:00");
  d.setDate(d.getDate() + 21);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export function ZarobekTab({ miesiac, dane, onUpdate, token, userName }: Props) {
  const weeks = useMemo(() => getWeeksOfMonth(miesiac), [miesiac]);

  // Każdy tydzień ma co najmniej jeden wiersz, ale może mieć wiele
  // niezależnych faktur (np. fakturę główną i fakturę z dodatkiem).
  const faktury = useMemo(
    () => normalizeMonthInvoices(dane.faktury, miesiac),
    [dane.faktury, miesiac]
  );

  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [importDriverName, setImportDriverName] = useState(KIEROWCA);
  const [importVehicleType, setImportVehicleType] = useState(TYP_TRANSPORTU);
  const [importDateFrom, setImportDateFrom] = useState("");
  const [importDateTo, setImportDateTo] = useState("");
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const uploadIntent = useRef<{ fakturaId: string; replaceExisting: boolean } | null>(null);
  const notifiedInvoiceValues = useRef<Record<string, number>>({});

  // ─── WGRYWANIE PDF ─────────────────────────────────────────────────────────

  function triggerFileInput(fakturaId: string, replaceExisting = false) {
    uploadIntent.current = { fakturaId, replaceExisting };
    fileInputRefs.current[fakturaId]?.click();
  }

  // Wybierz tydzień docelowy na podstawie dat z PDF (max overlap).
  // customRange ustawiany, gdy zakres z PDF ≠ pełny zakres tygodnia.
  function resolveTargetWeek(
    filtered: ImportModalProps["filtered"],
    clickedIdx: number
  ): { idx: number; label: string; customRange: { od: string; do: string } | null } {
    const fallbackIdx = clickedIdx >= 0 ? clickedIdx : 0;

    if (!filtered?.zakresOd || !filtered?.zakresDo) {
      return { idx: fallbackIdx, label: weeks[fallbackIdx].label, customRange: null };
    }

    const od = filtered.zakresOd;
    const do_ = filtered.zakresDo;
    const best = findBestWeekForRange(weeks, od, do_);
    const idx = best >= 0 ? best : fallbackIdx;
    const week = weeks[idx];

    // Zakres PDF dokładnie pokrywa tydzień → standardowa etykieta
    if (od === toISODate(week.start) && do_ === toISODate(week.end)) {
      return { idx, label: week.label, customRange: null };
    }
    // Fragment tygodnia lub przekroczenie granic → etykieta z PDF
    return { idx, label: formatRangeLabel(od, do_), customRange: { od, do: do_ } };
  }

  async function handleFileChange(
    e: React.ChangeEvent<HTMLInputElement>,
    fakturaId: string
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Wyczyść input, żeby można było wgrać ten sam plik ponownie
    e.target.value = "";

    setUploadingId(fakturaId);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("driverName", importDriverName.trim() || KIEROWCA);
      formData.append("vehicleType", importVehicleType.trim() || TYP_TRANSPORTU);
      if (importDateFrom) formData.append("dateFrom", importDateFrom);
      if (importDateTo) formData.append("dateTo", importDateTo);

      const res = await fetch("/api/import-invoice", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        const detail = json._reason ? `\n\nSzczegóły: ${json._reason}` : "";
        alert(`Błąd importu: ${json.error ?? "Nieznany błąd"}${detail}`);
        return;
      }

      const filteredFromApi = json.filtered
        ? {
            ...json.filtered,
            invoiceImportDateFrom: importDateFrom || json.filtered.invoiceImportDateFrom || json.filtered.filters?.dateFrom,
            invoiceImportDateTo: importDateTo || json.filtered.invoiceImportDateTo || json.filtered.filters?.dateTo,
            manualDateRangeSelected: Boolean(importDateFrom || importDateTo),
          }
        : null;
      const clickedIdx = faktury.findIndex((f) => f.id === fakturaId);
      const clicked = faktury[clickedIdx];
      const target = resolveTargetWeek(filteredFromApi, clicked?.weekIndex ?? 0);
      const intent = uploadIntent.current?.fakturaId === fakturaId
        ? uploadIntent.current
        : { fakturaId, replaceExisting: false };
      const preferredTarget = intent.replaceExisting
        ? clicked
        : clicked && clicked.weekIndex === target.idx && !clicked.pdfImport
          ? clicked
          : faktury.find((invoice) => invoice.weekIndex === target.idx && isEmptyInvoiceSlot(invoice));

      setModal({
        mode: "confirm",
        fakturaId,
        fileName: file.name,
        invoiceNumber: json.invoiceNumber ?? null,
        filtered: filteredFromApi,
        message: json.message,
        isOverwrite: intent.replaceExisting && !!clicked?.pdfImport,
        targetIdx: target.idx,
        targetRecordId: preferredTarget?.id ?? null,
        replaceExisting: intent.replaceExisting,
        targetLabel: target.label,
        targetWeekNumber: target.idx + 1,
        monthName: POLSKIE_MIESIACE[miesiac],
        customRange: target.customRange,
      });
    } catch {
      alert("Błąd połączenia — sprawdź, czy serwer działa.");
    } finally {
      uploadIntent.current = null;
      setUploadingId(null);
    }
  }

  // ─── ZAPISZ IMPORT DO STANU ────────────────────────────────────────────────

  function handleConfirmImport(nextFiltered?: ImportModalProps["filtered"] | null) {
    if (!modal?.filtered && !nextFiltered) return;

    const { fileName, invoiceNumber } = modal!;
    const filtered = nextFiltered ?? modal!.filtered;
    if (!filtered) return;
    const isPreviewUpdate = modal!.mode === "preview";
    const clickedIdx = faktury.findIndex((f) => f.id === modal!.fakturaId);
    const clicked = faktury[clickedIdx];
    const target = resolveTargetWeek(filtered, clicked?.weekIndex ?? modal!.targetIdx);

    const pdfImport: PDFImportData = {
      nazwaPliku: fileName,
      numerFaktury: invoiceNumber,
      filters: filtered.filters,
      invoiceImportDateFrom: filtered.invoiceImportDateFrom ?? filtered.filters?.dateFrom ?? filtered.zakresOd,
      invoiceImportDateTo: filtered.invoiceImportDateTo ?? filtered.filters?.dateTo ?? filtered.zakresDo,
      manualDateRangeSelected: filtered.manualDateRangeSelected ?? false,
      settlementVehiclePlate: null,
      settlementVehicleMode: "none",
      recordOverrides: filtered.recordOverrides,
      komentarz: filtered.komentarz?.trim() || undefined,
      dodatkiReczne: filtered.dodatkiReczne ?? [],
      courseNetto: filtered.courseNetto ?? filtered.netto,
      courseBrutto: filtered.courseBrutto ?? filtered.brutto,
      manualAdditionsNetto: filtered.manualAdditionsNetto ?? 0,
      manualAdditionsBrutto: filtered.manualAdditionsBrutto ?? 0,
      totalNetto: filtered.totalNetto ?? filtered.netto,
      totalBrutto: filtered.totalBrutto ?? filtered.brutto,
      ileKolek: filtered.ileKolek,
      ileZlecen: filtered.ileZlecen,
      kolkaNetto: filtered.kolkaNetto,
      kolkaBrutto: filtered.kolkaBrutto,
      zleceniaNetto: filtered.zleceniaNetto,
      zleceniaBrutto: filtered.zleceniaBrutto,
      sumaKm: filtered.sumaKm,
      netto: filtered.netto,
      brutto: filtered.brutto,
      sredniaKm: filtered.sredniaKm,
      sredniaNetto: filtered.sredniaNetto,
      sredniaBrutto: filtered.sredniaBrutto,
      zakresOd: filtered.zakresOd,
      zakresDo: filtered.zakresDo,
      pozycjeUwzglednione: filtered.includedRows,
      pozycjeOdrzucone: filtered.rejectedRows,
      sourceRows: filtered.sourceRows,
    };

    const preferred = modal!.targetRecordId
      ? faktury.find((invoice) => invoice.id === modal!.targetRecordId)
      : undefined;
    const available = faktury.find(
      (invoice) => invoice.weekIndex === target.idx && isEmptyInvoiceSlot(invoice)
    );
    const canReusePreferred = preferred
      && preferred.weekIndex === target.idx
      && !preferred.pdfImport;
    const destinationId = isPreviewUpdate || modal!.replaceExisting
      ? modal!.fakturaId
      : canReusePreferred
        ? preferred.id
        : available?.id ?? createAdditionalInvoiceId(miesiac, target.idx);

    // Zapis do auto-wybranego tygodnia. Gdy tydzień ma już fakturę,
    // tworzymy osobny rekord zamiast nadpisywać istniejący import.
    onUpdate((prev) => {
      const newFaktury = normalizeMonthInvoices(prev.faktury, miesiac);
      const destinationIdx = newFaktury.findIndex((invoice) => invoice.id === destinationId);
      const current = destinationIdx >= 0
        ? newFaktury[destinationIdx]
        : {
            id: destinationId,
            weekIndex: target.idx,
            label: target.label,
            kwota: 0,
            status: "do_wystawienia" as InvoiceStatus,
          };
      const updated: FakturaWeek = {
        ...current,
        weekIndex: target.idx,
        label: target.label,
        kwota: filtered.brutto,
        pdfImport,
        customRange: target.customRange,
      };

      if (destinationIdx >= 0) newFaktury[destinationIdx] = updated;
      else newFaktury.push(updated);

      return { ...prev, faktury: normalizeMonthInvoices(newFaktury, miesiac) };
    });

    logChange({
      workspaceId: token,
      userName,
      action: "faktura_zapisana",
      entity: "invoice",
      entityId: destinationId,
      newValue: {
        amount: filtered.brutto,
        source: "pdf",
        invoiceNumber,
        fileName,
        week: target.idx + 1,
        includedRows: filtered.includedRows?.length ?? 0,
        rejectedRows: filtered.rejectedRows?.length ?? 0,
        comment: pdfImport.komentarz,
        manualAdditionsBrutto: pdfImport.manualAdditionsBrutto ?? 0,
      },
      description: isPreviewUpdate
        ? `${userName} zaktualizował komentarz/import PDF: ${formatZlCaly(filtered.brutto)} (tydzień ${target.idx + 1})`
        : `${userName} dodał fakturę z PDF: ${formatZlCaly(filtered.brutto)} (tydzień ${target.idx + 1}, ${filtered.includedRows?.length ?? 0} poz.)`,
      url: `/admin?miesiac=${miesiac}&zakladka=zarobek`,
    });

    window.setTimeout(() => {
      if (isPreviewUpdate) {
        alert("Zapisano zmiany w imporcie PDF.");
        return;
      }
      const zakres =
        filtered.zakresOd && filtered.zakresDo
          ? `${formatRangeShort(filtered.zakresOd, filtered.zakresDo).replace("–", " – ")}`
          : "wybrany zakres";
      const lines = [`Zapisano ${filtered.ileKolek} kółek z zakresu ${zakres}.`];
      if ((filtered.manualAdditionsBrutto ?? 0) > 0) {
        lines.push(`Dodano dodatki ręczne: ${formatZl(filtered.manualAdditionsBrutto ?? 0)} brutto.`);
      }
      if ((filtered.rejectedRows?.length ?? 0) > 0) {
        lines.push(`Odrzucono ${filtered.rejectedRows?.length ?? 0} pozycji — zobacz powody.`);
      }
      alert(lines.join("\n"));
    }, 50);

    setModal(null);
  }

  // ─── USUŃ IMPORT ───────────────────────────────────────────────────────────

  function removeImport(fakturaId: string) {
    onUpdate((prev) => {
      const newFaktury = normalizeMonthInvoices(prev.faktury, miesiac);
      const idx = newFaktury.findIndex((f) => f.id === fakturaId);
      if (idx >= 0) {
        // Usuń import oraz customRange — etykieta wraca do standardowego tygodnia
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { pdfImport: _, customRange: __, ...rest } = newFaktury[idx];
        newFaktury[idx] = rest;
      }
      return { ...prev, faktury: newFaktury };
    });
  }

  // ─── PODGLĄD ZAPISANEGO IMPORTU ────────────────────────────────────────────

  // Otwórz modal w trybie preview, czytając dane z zapisanego stanu tygodnia
  function openPreview(fakturaId: string) {
    const f = faktury.find((invoice) => invoice.id === fakturaId);
    if (!f) return;
    const imp = f.pdfImport;
    if (!imp) return;
    const weekIndex = f.weekIndex ?? 0;

    setModal({
      mode: "preview",
      fakturaId: f.id,
      fileName: imp.nazwaPliku,
      invoiceNumber: imp.numerFaktury,
      filtered: {
        ileKolek: imp.ileKolek,
        ileZlecen: imp.ileZlecen,
        sumaKm: imp.sumaKm,
        netto: imp.netto,
        brutto: imp.brutto,
        sredniaKm: imp.sredniaKm,
        sredniaNetto: imp.sredniaNetto,
        sredniaBrutto: imp.sredniaBrutto,
        zakresOd: imp.zakresOd,
        zakresDo: imp.zakresDo,
        filters: imp.filters,
        includedRows: imp.pozycjeUwzglednione,
        rejectedRows: imp.pozycjeOdrzucone,
        sourceRows: imp.sourceRows,
        vehicleAssignmentRules: imp.vehicleAssignmentRules,
        recordOverrides: imp.recordOverrides,
        settlementVehiclePlate: imp.settlementVehiclePlate,
        settlementVehicleMode: imp.settlementVehicleMode,
        invoiceImportDateFrom: imp.invoiceImportDateFrom,
        invoiceImportDateTo: imp.invoiceImportDateTo,
        manualDateRangeSelected: imp.manualDateRangeSelected,
        komentarz: imp.komentarz,
        dodatkiReczne: imp.dodatkiReczne,
        courseNetto: imp.courseNetto,
        courseBrutto: imp.courseBrutto,
        manualAdditionsNetto: imp.manualAdditionsNetto,
        manualAdditionsBrutto: imp.manualAdditionsBrutto,
        totalNetto: imp.totalNetto,
        totalBrutto: imp.totalBrutto,
      },
      isOverwrite: false,
      targetIdx: weekIndex,
      targetRecordId: f.id,
      replaceExisting: true,
      targetLabel: f.label,
      targetWeekNumber: weekIndex + 1,
      monthName: POLSKIE_MIESIACE[miesiac],
      customRange: f.customRange ?? null,
    });
  }

  function handlePreviewRemove() {
    if (!modal) return;
    if (!window.confirm("Na pewno usunąć import?")) return;
    removeImport(modal.fakturaId);
    setModal(null);
  }

  function handlePreviewReupload() {
    if (!modal) return;
    const id = modal.fakturaId;
    setModal(null);
    triggerFileInput(id, true);
  }

  // ─── EDYCJA RĘCZNA KWOTY ───────────────────────────────────────────────────

  function setKwota(fakturaId: string, kwota: number) {
    onUpdate((prev) => {
      const newFaktury = normalizeMonthInvoices(prev.faktury, miesiac);
      const idx = newFaktury.findIndex((invoice) => invoice.id === fakturaId);
      if (idx >= 0) newFaktury[idx] = { ...newFaktury[idx], kwota };
      return { ...prev, faktury: newFaktury };
    });
  }

  function notifyManualInvoice(fakturaId: string, kwota: number) {
    if (kwota <= 0) return;
    const faktura = faktury.find((invoice) => invoice.id === fakturaId);
    if (!faktura || notifiedInvoiceValues.current[faktura.id] === kwota) return;
    notifiedInvoiceValues.current[faktura.id] = kwota;
    const weekNumber = (faktura.weekIndex ?? 0) + 1;

    logChange({
      workspaceId: token,
      userName,
      action: "faktura_zapisana",
      entity: "invoice",
      entityId: faktura.id,
      newValue: { amount: kwota, source: "manual", week: weekNumber },
      description: `${userName} dodał fakturę: ${formatZlCaly(kwota)} (tydzień ${weekNumber})`,
      url: `/admin?miesiac=${miesiac}&zakladka=zarobek`,
    });
  }

  // ─── STATUS FAKTURY ────────────────────────────────────────────────────────

  function setStatus(fakturaId: string, status: InvoiceStatus) {
    const faktura = faktury.find((invoice) => invoice.id === fakturaId);
    if (!faktura) return;
    const stary = faktura.status ?? "do_wystawienia";
    const weekNumber = (faktura.weekIndex ?? 0) + 1;
    onUpdate((prev) => {
      const newFaktury = normalizeMonthInvoices(prev.faktury, miesiac);
      const idx = newFaktury.findIndex((invoice) => invoice.id === fakturaId);
      if (idx >= 0) newFaktury[idx] = { ...newFaktury[idx], status };
      return { ...prev, faktury: newFaktury };
    });
    logChange({
      workspaceId: token,
      userName,
      action: "faktura_status",
      entity: "invoice",
      entityId: faktura.id,
      oldValue: { status: stary },
      newValue: { status },
      description: `${userName} zmienił status faktury (tydzień ${weekNumber}) na ${STATUSY.find((s) => s.id === status)?.label}`,
      url: `/admin?miesiac=${miesiac}&zakladka=zarobek`,
    });
  }

  function setIssueDate(fakturaId: string, issueDate: string) {
    onUpdate((prev) => {
      const newFaktury = normalizeMonthInvoices(prev.faktury, miesiac);
      const idx = newFaktury.findIndex((invoice) => invoice.id === fakturaId);
      if (idx >= 0) {
        newFaktury[idx] = { ...newFaktury[idx], issueDate: issueDate || undefined };
      }
      return { ...prev, faktury: newFaktury };
    });
  }

  const sumaFaktur = obliczPrzychod(faktury);
  const invoiceCountByWeek = new Map<number, number>();
  const invoicePositionById = new Map<string, number>();
  for (const invoice of faktury) {
    const weekIndex = invoice.weekIndex ?? 0;
    invoiceCountByWeek.set(weekIndex, (invoiceCountByWeek.get(weekIndex) ?? 0) + 1);
  }
  const seenByWeek = new Map<number, number>();
  for (const invoice of faktury) {
    const weekIndex = invoice.weekIndex ?? 0;
    const position = (seenByWeek.get(weekIndex) ?? 0) + 1;
    seenByWeek.set(weekIndex, position);
    invoicePositionById.set(invoice.id, position);
  }

  return (
    <>
      <div className="space-y-4">
        <CardTitle className="mb-0">Faktury tygodniowe</CardTitle>

        <div className="rounded-2xl border border-line bg-surface p-4 space-y-3">
          <div>
            <p className="text-sm font-bold text-white">Filtry importu PDF</p>
            <p className="text-xs text-dim">
              Parser liczy tylko rekordy z kolumn: kierowca, typ transportu i data załadunku.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="text-xs text-dim space-y-1">
              Kierowca
              <input
                value={importDriverName}
                onChange={(e) => setImportDriverName(e.target.value)}
                className="w-full bg-input border border-line rounded-[10px] px-3 py-2.5 text-[15px] text-ink focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20"
              />
            </label>
            <label className="text-xs text-dim space-y-1">
              Typ transportu
              <input
                value={importVehicleType}
                onChange={(e) => setImportVehicleType(e.target.value)}
                className="w-full bg-input border border-line rounded-[10px] px-3 py-2.5 text-[15px] text-ink focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20"
              />
            </label>
            <label className="text-xs text-dim space-y-1">
              Data od
              <input
                type="date"
                value={importDateFrom}
                onChange={(e) => setImportDateFrom(e.target.value)}
                className="w-full bg-input border border-line rounded-[10px] px-3 py-2.5 text-[15px] text-ink focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20"
              />
            </label>
            <label className="text-xs text-dim space-y-1">
              Data do
              <input
                type="date"
                value={importDateTo}
                onChange={(e) => setImportDateTo(e.target.value)}
                className="w-full bg-input border border-line rounded-[10px] px-3 py-2.5 text-[15px] text-ink focus:border-amber-brand focus:outline-none focus:ring-2 focus:ring-amber-brand/20"
              />
            </label>
          </div>
        </div>

        <div className="space-y-3">
          {faktury.map((faktura) => (
            <div
              key={faktura.id}
              className="rounded-2xl border border-line border-l-4 border-l-amber-brand bg-surface p-4 space-y-3"
            >
              {/* Etykieta + przycisk PDF */}
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-white leading-tight">
                    {faktura.label}
                  </p>
                  {(invoiceCountByWeek.get(faktura.weekIndex ?? 0) ?? 0) > 1 && (
                    <p className="mt-1 text-[11px] font-semibold text-amber-brand">
                      Faktura {invoicePositionById.get(faktura.id)} z {invoiceCountByWeek.get(faktura.weekIndex ?? 0)} dla tego tygodnia
                    </p>
                  )}
                </div>
                <button
                  onClick={() => triggerFileInput(faktura.id)}
                  disabled={uploadingId === faktura.id}
                  title={faktura.pdfImport ? "Dodaj kolejną fakturę PDF dla tego tygodnia" : "Dodaj fakturę PDF"}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 min-h-[36px] rounded-xl text-xs font-medium
                    border border-amber-brand/60 text-amber-brand bg-transparent
                    hover:bg-amber-brand/10
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-all duration-150"
                >
                  {uploadingId === faktura.id ? (
                    <IconLoader size={14} />
                  ) : (
                    <IconPaperclip size={14} />
                  )}
                  {uploadingId === faktura.id ? "Parsowanie…" : "+ Dodaj PDF"}
                </button>

                {/* Ukryty input pliku */}
                <input
                  ref={(el) => { fileInputRefs.current[faktura.id] = el; }}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => handleFileChange(e, faktura.id)}
                />
              </div>

              {/* Pole kwoty — readonly jeśli z PDF */}
              {faktura.pdfImport ? (
                <div className="relative">
                  <div className="w-full bg-input border border-amber-brand/30 rounded-[10px] pl-3 pr-12 py-3 text-right text-amber-brand font-semibold tabular-nums text-xl">
                    {formatZlCaly(faktura.kwota).replace(/\s*zł$/, "")}
                  </div>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-dim">
                    zł
                  </span>
                </div>
              ) : (
                <div className="relative">
                  <NumInput
                    value={faktura.kwota}
                    onChange={(val) => setKwota(faktura.id, val)}
                    onBlur={(e) => notifyManualInvoice(faktura.id, parseNum(e.currentTarget.value))}
                    placeholder="0"
                    className="!text-xl !py-3 !pr-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-dim pointer-events-none">
                    zł
                  </span>
                </div>
              )}

              {/* Status faktury + data wystawienia + termin płatności */}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <select
                  value={faktura.status ?? "do_wystawienia"}
                  onChange={(e) => setStatus(faktura.id, e.target.value as InvoiceStatus)}
                  className={`bg-input border rounded-lg px-2 py-1.5 ${STATUSY.find((s) => s.id === (faktura.status ?? "do_wystawienia"))?.cls}`}
                >
                  {STATUSY.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={faktura.issueDate ?? ""}
                  onChange={(e) => setIssueDate(faktura.id, e.target.value)}
                  title="Data wystawienia"
                  className="bg-input border border-line rounded-lg px-2 py-1.5 text-dim tabular-nums"
                />
                {faktura.issueDate && (
                  <span className="text-dim/70 tabular-nums">
                    płatność do <span className="text-ink">{terminPlatnosci(faktura.issueDate)}</span>{" "}
                    <span className="text-dim/50">(auto, 21 dni)</span>
                  </span>
                )}
              </div>

              {/* Podpis importu PDF — zielona pill, klik otwiera podgląd */}
              {faktura.pdfImport && (
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openPreview(faktura.id)}
                    title="Pokaż podgląd importu PDF"
                    className="group flex items-center gap-1.5 min-w-0 text-left cursor-pointer
                      px-3 py-1.5 rounded-full bg-green-soft border border-green-500/40
                      hover:border-green-400/70 transition-all duration-150"
                  >
                    <span className="shrink-0 text-green-400">
                      <IconCheck size={14} />
                    </span>
                    <span className="text-xs text-green-200 leading-snug truncate">
                      Z PDF:{" "}
                      {faktura.pdfImport.zakresOd && faktura.pdfImport.zakresDo && (
                        <>
                          {formatRangeShort(faktura.pdfImport.zakresOd, faktura.pdfImport.zakresDo)}
                          {" · "}
                        </>
                      )}
                      {faktura.pdfImport.ileKolek} kółek
                      {(faktura.pdfImport.ileZlecen ?? 0) > 0 && (
                        <> {" · "}{faktura.pdfImport.ileZlecen} zlec.</>
                      )}
                      {" · "}
                      {faktura.pdfImport.sumaKm} km
                      {" · netto "}
                      {formatZl(faktura.pdfImport.netto)}
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm("Na pewno usunąć import PDF?")) removeImport(faktura.id);
                    }}
                    title="Usuń import PDF"
                    className="shrink-0 p-1.5 rounded-lg text-dim hover:text-red-400 hover:bg-red-soft transition-all duration-150"
                  >
                    <IconX size={16} />
                  </button>
                </div>
              )}

              {faktura.pdfImport?.komentarz && (
                <button
                  type="button"
                  onClick={() => openPreview(faktura.id)}
                  className="w-full text-left rounded-xl border border-line bg-surface2 px-3 py-2 text-xs text-dim hover:border-amber-brand/50 hover:text-ink transition-colors"
                >
                  <span className="text-amber-brand font-semibold">Komentarz:</span>{" "}
                  {faktura.pdfImport.komentarz}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Suma */}
        <div className="flex items-center justify-between px-4 py-4 rounded-2xl bg-surface border border-amber-brand/40">
          <span className="text-sm font-bold text-white">Przychód miesięczny</span>
          <span className="text-2xl font-extrabold text-amber-brand tabular-nums">
            {formatZlCaly(sumaFaktur)}
          </span>
        </div>
      </div>

      {/* Modal importu PDF */}
      {modal && (
        <ImportModal
          mode={modal.mode}
          invoiceNumber={modal.invoiceNumber}
          filtered={modal.filtered}
          message={modal.message}
          fileName={modal.fileName}
          isOverwrite={modal.isOverwrite}
          targetInfo={{
            label: modal.targetLabel,
            weekNumber: modal.targetWeekNumber,
            monthName: modal.monthName,
          }}
          onConfirm={handleConfirmImport}
          onCancel={() => setModal(null)}
          onRemove={handlePreviewRemove}
          onReupload={handlePreviewReupload}
        />
      )}
    </>
  );
}
