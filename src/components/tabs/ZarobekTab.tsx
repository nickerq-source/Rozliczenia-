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

  // Dopasuj faktury do tygodni, zachowując zapisane kwoty, pdfImport i customRange.
  // Etykieta: customRange z PDF wygrywa nad standardowym zakresem pon–niedz.
  const faktury: FakturaWeek[] = weeks.map((w, i) => {
    const saved = dane.faktury[i];
    const customRange = saved?.customRange ?? null;
    return {
      id: `w${miesiac}-${i}`,
      label: customRange ? formatRangeLabel(customRange.od, customRange.do) : w.label,
      kwota: saved?.kwota ?? 0,
      pdfImport: saved?.pdfImport,
      customRange,
      status: saved?.status ?? "do_wystawienia",
      issueDate: saved?.issueDate,
    };
  });

  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [importDriverName, setImportDriverName] = useState(KIEROWCA);
  const [importVehicleType, setImportVehicleType] = useState(TYP_TRANSPORTU);
  const [importDateFrom, setImportDateFrom] = useState("");
  const [importDateTo, setImportDateTo] = useState("");
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const notifiedInvoiceValues = useRef<Record<string, number>>({});

  // ─── WGRYWANIE PDF ─────────────────────────────────────────────────────────

  function triggerFileInput(fakturaId: string, hasExistingImport: boolean) {
    if (hasExistingImport) {
      const ok = window.confirm("Nadpisać poprzedni import?");
      if (!ok) return;
    }
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

      const clickedIdx = faktury.findIndex((f) => f.id === fakturaId);
      const target = resolveTargetWeek(json.filtered, clickedIdx);

      setModal({
        mode: "confirm",
        fakturaId,
        fileName: file.name,
        invoiceNumber: json.invoiceNumber ?? null,
        filtered: json.filtered ?? null,
        message: json.message,
        isOverwrite: !!faktury[target.idx]?.pdfImport,
        targetIdx: target.idx,
        targetLabel: target.label,
        targetWeekNumber: target.idx + 1,
        monthName: POLSKIE_MIESIACE[miesiac],
        customRange: target.customRange,
      });
    } catch {
      alert("Błąd połączenia — sprawdź, czy serwer działa.");
    } finally {
      setUploadingId(null);
    }
  }

  // ─── ZAPISZ IMPORT DO STANU ────────────────────────────────────────────────

  function handleConfirmImport() {
    if (!modal?.filtered) return;

    const { fileName, invoiceNumber, filtered, targetIdx, customRange } = modal;

    const pdfImport: PDFImportData = {
      nazwaPliku: fileName,
      numerFaktury: invoiceNumber,
      filters: filtered.filters,
      ileKolek: filtered.ileKolek,
      ileZlecen: filtered.ileZlecen,
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
    };

    // Zapis do auto-wybranego tygodnia (na podstawie dat z PDF), nie do klikniętego
    onUpdate((prev) => {
      const newFaktury = [...faktury];
      if (targetIdx >= 0 && targetIdx < newFaktury.length) {
        newFaktury[targetIdx] = {
          ...newFaktury[targetIdx],
          kwota: filtered.brutto,
          pdfImport,
          customRange,
        };
      }
      return { ...prev, faktury: newFaktury };
    });

    logChange({
      workspaceId: token,
      userName,
      action: "faktura_zapisana",
      entity: "invoice",
      entityId: faktury[targetIdx]?.id,
      newValue: {
        amount: filtered.brutto,
        source: "pdf",
        invoiceNumber,
        fileName,
        week: targetIdx + 1,
      },
      description: `${userName} dodał fakturę z PDF: ${formatZlCaly(filtered.brutto)} (tydzień ${targetIdx + 1})`,
      url: `/admin?miesiac=${miesiac}&zakladka=zarobek`,
    });

    setModal(null);
  }

  // ─── USUŃ IMPORT ───────────────────────────────────────────────────────────

  function removeImport(fakturaId: string) {
    onUpdate((prev) => {
      const newFaktury = [...faktury];
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
  function openPreview(idx: number) {
    const f = faktury[idx];
    const imp = f.pdfImport;
    if (!imp) return;

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
      },
      isOverwrite: false,
      targetIdx: idx,
      targetLabel: f.label,
      targetWeekNumber: idx + 1,
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

  function setKwota(idx: number, kwota: number) {
    onUpdate((prev) => {
      const newFaktury = [...faktury];
      newFaktury[idx] = { ...newFaktury[idx], kwota };
      return { ...prev, faktury: newFaktury };
    });
  }

  function notifyManualInvoice(idx: number, kwota: number) {
    if (kwota <= 0) return;
    const faktura = faktury[idx];
    if (!faktura || notifiedInvoiceValues.current[faktura.id] === kwota) return;
    notifiedInvoiceValues.current[faktura.id] = kwota;

    logChange({
      workspaceId: token,
      userName,
      action: "faktura_zapisana",
      entity: "invoice",
      entityId: faktura.id,
      newValue: { amount: kwota, source: "manual", week: idx + 1 },
      description: `${userName} dodał fakturę: ${formatZlCaly(kwota)} (tydzień ${idx + 1})`,
      url: `/admin?miesiac=${miesiac}&zakladka=zarobek`,
    });
  }

  // ─── STATUS FAKTURY ────────────────────────────────────────────────────────

  function setStatus(idx: number, status: InvoiceStatus) {
    const stary = faktury[idx].status ?? "do_wystawienia";
    onUpdate((prev) => {
      const newFaktury = [...faktury];
      newFaktury[idx] = { ...newFaktury[idx], status };
      return { ...prev, faktury: newFaktury };
    });
    logChange({
      workspaceId: token,
      userName,
      action: "faktura_status",
      entity: "invoice",
      entityId: faktury[idx].id,
      oldValue: { status: stary },
      newValue: { status },
      description: `${userName} zmienił status faktury (tydzień ${idx + 1}) na ${STATUSY.find((s) => s.id === status)?.label}`,
      url: `/admin?miesiac=${miesiac}&zakladka=zarobek`,
    });
  }

  function setIssueDate(idx: number, issueDate: string) {
    onUpdate((prev) => {
      const newFaktury = [...faktury];
      newFaktury[idx] = { ...newFaktury[idx], issueDate: issueDate || undefined };
      return { ...prev, faktury: newFaktury };
    });
  }

  const sumaFaktur = obliczPrzychod(faktury);

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
          {faktury.map((faktura, idx) => (
            <div
              key={faktura.id}
              className="rounded-2xl border border-line border-l-4 border-l-amber-brand bg-surface p-4 space-y-3"
            >
              {/* Etykieta + przycisk PDF */}
              <div className="flex items-center justify-between gap-2">
                <label className="text-[15px] font-bold text-white leading-tight">
                  {faktura.label}
                </label>
                <button
                  onClick={() =>
                    triggerFileInput(faktura.id, !!faktura.pdfImport)
                  }
                  disabled={uploadingId === faktura.id}
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
                    onChange={(val) => setKwota(idx, val)}
                    onBlur={(e) => notifyManualInvoice(idx, parseNum(e.currentTarget.value))}
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
                  onChange={(e) => setStatus(idx, e.target.value as InvoiceStatus)}
                  className={`bg-input border rounded-lg px-2 py-1.5 ${STATUSY.find((s) => s.id === (faktura.status ?? "do_wystawienia"))?.cls}`}
                >
                  {STATUSY.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={faktura.issueDate ?? ""}
                  onChange={(e) => setIssueDate(idx, e.target.value)}
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
                    onClick={() => openPreview(idx)}
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
                    onClick={() => removeImport(faktura.id)}
                    title="Usuń import PDF"
                    className="shrink-0 p-1.5 rounded-lg text-dim hover:text-red-400 hover:bg-red-soft transition-all duration-150"
                  >
                    <IconX size={16} />
                  </button>
                </div>
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
