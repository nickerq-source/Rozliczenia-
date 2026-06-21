"use client";

// Tankowanie w panelu kierowcy: szybki flow telefoniczny.
// Kierowca dodaje zdjęcia paragonu i licznika, AI rozpoznaje typy, a zapis
// następuje dopiero po ręcznym sprawdzeniu danych.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "./ui/Card";
import { imageToCompressedDataUrl } from "@/lib/image";
import { ReceiptScanResult, scanReceiptDataUrl } from "@/lib/receipt-scan-client";
import type { KosztZalacznik, VatRate, WpisTankowania } from "@/lib/types";
import { formatZlCaly } from "@/lib/business-logic";
import { fuelStatusLabel } from "@/lib/fuel-calculations";
import { ZalacznikPreview } from "./ZalacznikPreview";
import {
  IconGasStation,
  IconCamera,
  IconPaperclip,
  IconLoader,
  IconCheck,
  IconX,
  IconPlus,
  IconTrash,
  IconLock,
  IconAlertTriangle,
  IconRoad,
} from "./ui/icons";
import { DriverLanguage, driverMonthName, driverTexts } from "@/lib/driver-translations";
import { useAppBackLayer } from "@/lib/mobile-navigation";

type PhotoType = "receipt" | "odometer" | "tachograph" | "unknown";
type FuelFormStep = "photos" | "review";

interface PhotoItem {
  id: string;
  fileName: string;
  dataUrl: string;
  type: PhotoType;
  confidence: number;
  needsReview: boolean;
  scan?: ReceiptScanResult;
  error?: string;
  manualType?: boolean;
}

interface WpisListy {
  id: string;
  data: string;
  koszt: number;
  litry?: number;
  odometerKm?: number;
  kmSinceLastFuel?: number;
  fuelBeforeRefuelLiters?: number;
  costPerKmGross?: number;
  costPerKmNet?: number;
  fuelConsumptionLPer100Km?: number;
  fuelStatus?: WpisTankowania["fuelStatus"];
  needsReview?: boolean;
  reviewReasons?: string[];
  supplierName?: string;
  stationName?: string;
  zalaczniki?: KosztZalacznik[];
  expenseDate?: string;
  isHistorical?: boolean;
  includeInReports?: boolean;
  status?: WpisTankowania["status"];
  tachoStatus?: string;
  speed?: number;
  note?: string;
  rejectionReason?: string;
  miesiac: number;
  nazwaMiesiaca: string;
  zamkniety: boolean;
}

const VAT_OPTIONS: { id: VatRate; label: string }[] = [
  { id: "0.23", label: "23%" },
  { id: "0.08", label: "8%" },
  { id: "0.05", label: "5%" },
  { id: "0", label: "0%" },
  { id: "zw", label: "zw." },
  { id: "np", label: "np." },
];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const num = (s: string): number => parseFloat(s.replace(",", "."));
const ddmm = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const round2 = (n: number): number => Math.round(n * 100) / 100;

function formatMaybeNumber(n: number | undefined | null, suffix = ""): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("pl-PL", { maximumFractionDigits: 2 })}${suffix}`;
}

function vatToNumber(rate: VatRate | ""): number | null {
  if (!rate || rate === "zw" || rate === "np") return null;
  return parseFloat(rate);
}

function photoLabel(type: PhotoType): string {
  if (type === "receipt") return "Paragon / faktura";
  if (type === "odometer") return "Licznik";
  if (type === "tachograph") return "Tachograf";
  return "Niepewne";
}

function bestPhoto(photos: PhotoItem[], type: Exclude<PhotoType, "unknown">): PhotoItem | null {
  const candidates = photos.filter((p) => p.type === type);
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates[0] ?? null;
}

export function TankowanieKierowcy({ lang }: { lang: DriverLanguage }) {
  const t = driverTexts(lang);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanInfo, setScanInfo] = useState<null | "ok" | "manual">(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [step, setStep] = useState<FuelFormStep>("photos");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const [lista, setLista] = useState<WpisListy[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [delBusyId, setDelBusyId] = useState<string | null>(null);
  const [ostatniWynik, setOstatniWynik] = useState<WpisTankowania | null>(null);

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [fData, setFData] = useState(todayISO());
  const [fLitry, setFLitry] = useState("");
  const [fCena, setFCena] = useState("");
  const [fKwotaNetto, setFKwotaNetto] = useState("");
  const [fVatKwota, setFVatKwota] = useState("");
  const [fKwota, setFKwota] = useState("");
  const [fVat, setFVat] = useState<VatRate | "">("0.23");
  const [fSprzedawca, setFSprzedawca] = useState("");
  const [fNip, setFNip] = useState("");
  const [fDokument, setFDokument] = useState("");
  const [fPrzebieg, setFPrzebieg] = useState("");
  const [fTachoStatus, setFTachoStatus] = useState("");
  const [fSpeed, setFSpeed] = useState("");
  const [fNotatka, setFNotatka] = useState("");
  const [mileageSuggestion, setMileageSuggestion] = useState<string | null>(null);

  const receiptPhoto = useMemo(() => bestPhoto(photos, "receipt"), [photos]);
  const odometerPhoto = useMemo(() => bestPhoto(photos, "odometer"), [photos]);
  const tachographPhoto = useMemo(() => bestPhoto(photos, "tachograph"), [photos]);
  const anyAiReview = photos.some((p) => p.needsReview || p.type === "unknown");
  const outsideMainRange = fData < "2026-06-01" || fData > "2026-12-31";
  const hasUnsavedChanges = useMemo(() => {
    if (!open) return false;
    return (
      photos.length > 0 ||
      fData !== todayISO() ||
      !!fLitry.trim() ||
      !!fCena.trim() ||
      !!fKwotaNetto.trim() ||
      !!fVatKwota.trim() ||
      !!fKwota.trim() ||
      fVat !== "0.23" ||
      !!fSprzedawca.trim() ||
      !!fNip.trim() ||
      !!fDokument.trim() ||
      !!fPrzebieg.trim() ||
      !!fTachoStatus.trim() ||
      !!fSpeed.trim() ||
      !!fNotatka.trim()
    );
  }, [fCena, fData, fDokument, fKwota, fKwotaNetto, fLitry, fNip, fNotatka, fPrzebieg, fSpeed, fSprzedawca, fTachoStatus, fVat, fVatKwota, open, photos.length]);

  const wczytaj = useCallback(async () => {
    try {
      const r = await fetch("/api/driver/fuel");
      if (!r.ok) return;
      const j = await r.json();
      setLista(j.tankowania ?? []);
    } catch {
      /* lista nieobowiązkowa */
    }
  }, []);

  useEffect(() => {
    wczytaj();
  }, [wczytaj]);

  const reset = useCallback(() => {
    setFData(todayISO());
    setFLitry("");
    setFCena("");
    setFKwotaNetto("");
    setFVatKwota("");
    setFKwota("");
    setFVat("0.23");
    setFSprzedawca("");
    setFNip("");
    setFDokument("");
    setFPrzebieg("");
    setFTachoStatus("");
    setFSpeed("");
    setFNotatka("");
    setMileageSuggestion(null);
    setPhotos([]);
    setScanInfo(null);
    setBlad(null);
    setDuplicateWarning(null);
    setStep("photos");
    setConfirmDiscard(false);
  }, []);

  const forceClose = useCallback(() => {
    reset();
    setOpen(false);
  }, [reset]);

  const requestClose = useCallback(() => {
    if (busy) return false;
    if (hasUnsavedChanges) {
      setConfirmDiscard(true);
      return false;
    }
    reset();
    setOpen(false);
    return true;
  }, [busy, hasUnsavedChanges, reset]);

  useAppBackLayer(
    open && step === "review" && photos.length > 0,
    "driver-fuel-review-step",
    () => {
      setStep("photos");
      return true;
    },
    55
  );
  useAppBackLayer(open, "driver-fuel-form", requestClose, 50);
  useAppBackLayer(
    !!duplicateWarning,
    "driver-fuel-duplicate-warning",
    () => {
      setDuplicateWarning(null);
      return true;
    },
    75
  );
  useAppBackLayer(
    confirmDiscard,
    "driver-fuel-unsaved-confirm",
    () => {
      setConfirmDiscard(false);
      return true;
    },
    90
  );

  function przeliczKwote(litryStr: string, cenaStr: string) {
    const l = num(litryStr);
    const c = num(cenaStr);
    if (isFinite(l) && l > 0 && isFinite(c) && c > 0) {
      setFKwota(String(round2(l * c)));
    }
  }

  function przeliczVatZBrutto(bruttoStr: string, vat: VatRate | "") {
    const brutto = num(bruttoStr);
    const stawka = vatToNumber(vat);
    if (!isFinite(brutto) || brutto <= 0 || stawka == null) return;
    const netto = round2(brutto / (1 + stawka));
    setFKwotaNetto(String(netto));
    setFVatKwota(String(round2(brutto - netto)));
  }

  function applyScan(scan: ReceiptScanResult) {
    if (scan.documentType === "odometer" || scan.documentType === "tachograph") {
      if (scan.tachoStatus) setFTachoStatus(scan.tachoStatus);
      if (scan.speed != null) setFSpeed(String(scan.speed));
      if (scan.odometerKm != null) {
        const text = `${scan.odometerKm} km`;
        if ((scan.confidence ?? 0) >= 0.75) {
          setFPrzebieg(String(scan.odometerKm));
          setMileageSuggestion(`Rozpoznano przebieg: ${text}.`);
        } else {
          setMileageSuggestion(`Możliwy przebieg: ${text} — potwierdź albo wpisz ręcznie.`);
        }
      } else {
        setMileageSuggestion("Nie udało się rozpoznać przebiegu. Wpisz ręcznie.");
      }
      return;
    }
    if (scan.documentType !== "receipt") return;

    let cena = scan.cenaZaLitr;
    if (cena == null && scan.kwotaBrutto != null && scan.litry != null && scan.litry > 0) {
      cena = round2(scan.kwotaBrutto / scan.litry);
    }

    if (scan.data) setFData(scan.data);
    if (scan.sprzedawca) setFSprzedawca(scan.sprzedawca);
    if (scan.nip) setFNip(scan.nip);
    if (scan.documentNumber) setFDokument(scan.documentNumber);
    if (scan.litry != null) setFLitry(String(scan.litry));
    if (cena != null) setFCena(String(cena));
    if (scan.netAmount != null) setFKwotaNetto(String(scan.netAmount));
    if (scan.vatAmount != null) setFVatKwota(String(scan.vatAmount));
    if (scan.kwotaBrutto != null) setFKwota(String(scan.kwotaBrutto));
    else if (scan.litry != null && cena != null) setFKwota(String(round2(scan.litry * cena)));
    if (scan.vatRate) setFVat(scan.vatRate);
    else if (scan.vatNeedsReview) setFVat("");
  }

  async function onZdjecia(e: React.ChangeEvent<HTMLInputElement>, preferredType?: Exclude<PhotoType, "unknown">) {
    const files = Array.from(e.target.files ?? []);
    e.currentTarget.value = "";
    if (!files.length) return;

    setBusy(true);
    setBlad(null);
    setDuplicateWarning(null);
    const nextItems: PhotoItem[] = [];
    try {
      for (const file of files) {
        const dataUrl = await imageToCompressedDataUrl(file, 2000, 0.84);
        try {
          const scan = await scanReceiptDataUrl(dataUrl, file.name);
          const type = ((scan.documentType && scan.documentType !== "unknown" ? scan.documentType : preferredType) ?? "unknown") as PhotoType;
          nextItems.push({
            id: crypto.randomUUID(),
            fileName: file.name,
            dataUrl,
            type,
            confidence: scan.confidence ?? 0,
            needsReview: !!scan.needsReview || type === "unknown" || !!scan.error,
            scan,
            error: scan.error,
          });
          applyScan(scan);
        } catch {
          nextItems.push({
            id: crypto.randomUUID(),
            fileName: file.name,
            dataUrl,
            type: preferredType ?? "unknown",
            confidence: 0,
            needsReview: true,
            error: "Nie udało się automatycznie rozpoznać danych. Wpisz je ręcznie.",
          });
        }
      }
      setPhotos((prev) => [...prev, ...nextItems]);
      setScanInfo(nextItems.some((p) => p.type !== "unknown") ? "ok" : "manual");
      setStep("review");
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  function ustawTypZdjecia(id: string, type: Exclude<PhotoType, "unknown">) {
    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        if (p.scan) applyScan({ ...p.scan, documentType: type });
        return { ...p, type, manualType: true, needsReview: false };
      })
    );
  }

  async function zapisz(confirmDuplicate = false) {
    const kwota = num(fKwota);
    if (!isFinite(kwota) || kwota <= 0) {
      setBlad(t.fuel.amountRequired);
      return;
    }
    if (!fVat) {
      setBlad("Wybierz VAT albo popraw dane z paragonu.");
      return;
    }
    const litry = num(fLitry);
    const cena = num(fCena);
    const netto = num(fKwotaNetto);
    const vatAmount = num(fVatKwota);
    const przebieg = num(fPrzebieg);
    const speed = num(fSpeed);
    setBusy(true);
    setBlad(null);
    setDuplicateWarning(null);
    try {
      const res = await fetch("/api/driver/fuel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: fData,
          koszt: kwota,
          litry: isFinite(litry) && litry > 0 ? litry : undefined,
          cenaZaLitr: isFinite(cena) && cena > 0 ? cena : undefined,
          netAmount: isFinite(netto) && netto > 0 ? netto : undefined,
          vatAmount: isFinite(vatAmount) && vatAmount > 0 ? vatAmount : undefined,
          vatRate: fVat,
          vatNeedsReview: !fVat,
          aiNeedsReview: anyAiReview,
          sprzedawca: fSprzedawca || undefined,
          nip: fNip || undefined,
          documentNumber: fDokument || undefined,
          odometerKm: isFinite(przebieg) && przebieg > 0 ? Math.round(przebieg) : undefined,
          mileageSource: tachographPhoto ? "tachograph" : odometerPhoto ? "ai" : isFinite(przebieg) && przebieg > 0 ? "manual" : undefined,
          mileageConfidence: Math.max(odometerPhoto?.confidence ?? 0, tachographPhoto?.confidence ?? 0),
          tachoStatus: fTachoStatus || undefined,
          speed: isFinite(speed) ? speed : undefined,
          note: fNotatka || undefined,
          receiptImage: receiptPhoto?.dataUrl,
          odometerImage: odometerPhoto?.dataUrl,
          tachographImage: tachographPhoto?.dataUrl,
          receiptConfidence: receiptPhoto?.confidence,
          odometerConfidence: odometerPhoto?.confidence,
          tachographConfidence: tachographPhoto?.confidence,
          confirmDuplicate,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409 && json.duplicate) {
        setDuplicateWarning(json.error ?? "Podobne tankowanie już istnieje.");
        return;
      }
      if (!res.ok) {
        setBlad(json.error ?? t.fuel.saveError);
        return;
      }
      setOstatniWynik(json.wpis ?? null);
      reset();
      setOpen(false);
      await wczytaj();
    } catch {
      setBlad(t.fuel.connectionError);
    } finally {
      setBusy(false);
    }
  }

  async function usun(w: WpisListy) {
    setDelBusyId(w.id);
    try {
      const res = await fetch("/api/driver/fuel", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: w.id, miesiac: w.miesiac }),
      });
      if (res.ok) {
        setConfirmId(null);
        await wczytaj();
      }
    } catch {
      /* zostaw — kierowca spróbuje ponownie */
    } finally {
      setDelBusyId(null);
    }
  }

  const inputCls =
    "mt-0.5 w-full bg-input border border-line rounded-lg px-2.5 py-2 text-sm text-ink placeholder:text-dim/40";

  const pickerCls = `flex items-center justify-center gap-1.5 py-2.5 min-h-[44px] rounded-xl border border-dashed border-amber-brand/50 px-2 text-sm text-amber-brand transition-all ${
    busy ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-amber-brand/10"
  }`;

  const photoInput = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-line bg-surface2/60 p-2">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-dim">
          Faktura / paragon
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className={pickerCls}>
            {busy ? <IconLoader size={15} /> : <IconCamera size={15} />}
            {busy ? t.fuel.reading : "Aparat"}
            <input
              type="file"
              accept="image/*,.heic,.heif"
              capture="environment"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(e) => onZdjecia(e, "receipt")}
            />
          </label>
          <label className={pickerCls}>
            {busy ? <IconLoader size={15} /> : <IconPaperclip size={15} />}
            {busy ? t.fuel.reading : "Galeria"}
            <input
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(e) => onZdjecia(e, "receipt")}
            />
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface2/60 p-2">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-dim">
          Licznik / tacho
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className={pickerCls}>
            {busy ? <IconLoader size={15} /> : <IconCamera size={15} />}
            {busy ? t.fuel.reading : "Aparat"}
            <input
              type="file"
              accept="image/*,.heic,.heif"
              capture="environment"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(e) => onZdjecia(e, "tachograph")}
            />
          </label>
          <label className={pickerCls}>
            {busy ? <IconLoader size={15} /> : <IconPaperclip size={15} />}
            {busy ? t.fuel.reading : "Galeria"}
            <input
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(e) => onZdjecia(e, "tachograph")}
            />
          </label>
        </div>
      </div>
    </div>
  );

  return (
    <Card>
      <div className="flex items-center gap-2">
        <IconGasStation size={18} className="text-amber-brand" />
        <h2 className="text-sm font-bold text-white">{t.fuel.title}</h2>
      </div>
      <p className="text-xs text-dim mt-1">
        Dodaj paragon i zdjęcie licznika. System sam rozpozna, które zdjęcie jest które.
      </p>

      {!open ? (
        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={() => {
              reset();
              setStep("review");
              setOpen(true);
            }}
            className="flex w-full items-center justify-center gap-1.5 py-2.5 min-h-[44px] rounded-xl border border-dashed border-amber-brand/50 text-sm text-amber-brand hover:bg-amber-brand/10 transition-all"
          >
            <IconPlus size={15} /> {t.fuel.manual}
          </button>
          {photoInput}
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {step === "photos" ? (
            <div className="rounded-2xl border border-line bg-surface2/70 p-3">
              <p className="mb-1 text-xs font-bold text-white">1. Dodaj zdjęcia tankowania</p>
              <p className="mb-3 text-[11px] text-dim">
                Możesz dodać paragon i licznik w dowolnej kolejności. Jeśli AI nie jest pewne, wybierz typ ręcznie.
              </p>
              {photoInput}
              {photos.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {photos.map((p) => (
                    <div key={p.id} className="rounded-xl border border-line bg-input p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.dataUrl} alt={p.fileName} className="h-24 w-full rounded-lg object-cover bg-black/30" data-swipe-ignore="true" />
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          p.type === "receipt"
                            ? "bg-green-soft text-green-300"
                            : p.type === "odometer" || p.type === "tachograph"
                            ? "bg-amber-brand/10 text-amber-brand"
                            : "bg-red-soft text-red-300"
                        }`}>
                          {photoLabel(p.type)}
                        </span>
                        <span className="text-[10px] text-dim">{Math.round((p.confidence ?? 0) * 100)}%</span>
                      </div>
                      {(p.type === "unknown" || p.needsReview) && (
                        <div className="mt-2 grid grid-cols-3 gap-1">
                          <button
                            type="button"
                            onClick={() => ustawTypZdjecia(p.id, "receipt")}
                            className="rounded-lg border border-line px-2 py-1 text-[10px] text-amber-brand"
                          >
                            Paragon
                          </button>
                          <button
                            type="button"
                            onClick={() => ustawTypZdjecia(p.id, "odometer")}
                            className="rounded-lg border border-line px-2 py-1 text-[10px] text-amber-brand"
                          >
                            Licznik
                          </button>
                          <button
                            type="button"
                            onClick={() => ustawTypZdjecia(p.id, "tachograph")}
                            className="rounded-lg border border-line px-2 py-1 text-[10px] text-amber-brand"
                          >
                            Tacho
                          </button>
                        </div>
                      )}
                      {p.error && <p className="mt-1 text-[10px] text-red-300">{p.error}</p>}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={requestClose}
                  disabled={busy}
                  className="flex-1 py-2 rounded-xl border border-line text-dim text-sm hover:text-ink disabled:opacity-50"
                >
                  {t.fuel.cancel}
                </button>
                <button
                  type="button"
                  onClick={() => setStep("review")}
                  disabled={busy || photos.length === 0}
                  className="flex-1 py-2 rounded-xl bg-amber-brand text-amber-ink font-bold text-sm hover:bg-[#e09420] disabled:opacity-50"
                >
                  Sprawdź dane
                </button>
              </div>
            </div>
          ) : (
            photos.length > 0 && (
              <button
                type="button"
                onClick={() => setStep("photos")}
                className="w-full rounded-2xl border border-line bg-surface2/70 p-3 text-left transition-colors hover:border-amber-brand/50"
              >
                <p className="text-xs font-bold text-white">1. Zdjęcia tankowania</p>
                <p className="mt-1 text-[11px] text-dim">
                  {photos.length} zdjęć · dotknij, żeby wrócić do edycji zdjęć
                </p>
              </button>
            )
          )}

          {step === "review" && scanInfo && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-brand/10 border border-amber-brand/40 text-amber-brand text-[11px] font-medium">
              <IconCheck size={12} />
              {scanInfo === "manual" ? t.fuel.aiManual : "AI odczytało zdjęcia — sprawdź dane"}
            </span>
          )}

          {step === "review" && (
            <>
              <div className="rounded-2xl border border-line bg-surface2/70 p-3">
                <p className="mb-3 text-xs font-bold text-white">2. Sprawdź dane tankowania</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="text-dim">
                    {t.fuel.date}
                    <input type="date" value={fData} onChange={(e) => setFData(e.target.value)} className={inputCls} />
                  </label>
                  <label className="text-dim">
                    {t.fuel.station}
                    <input value={fSprzedawca} onChange={(e) => setFSprzedawca(e.target.value)} placeholder={t.fuel.stationPlaceholder} className={inputCls} />
                  </label>
                  <label className="text-dim">
                    {t.fuel.liters}
                    <input inputMode="decimal" value={fLitry} onChange={(e) => { setFLitry(e.target.value); przeliczKwote(e.target.value, fCena); }} placeholder="0" className={`${inputCls} tabular-nums`} />
                  </label>
                  <label className="text-dim">
                    {t.fuel.pricePerLiter}
                    <input inputMode="decimal" value={fCena} onChange={(e) => { setFCena(e.target.value); przeliczKwote(fLitry, e.target.value); }} placeholder="0,00" className={`${inputCls} tabular-nums`} />
                  </label>
                  <label className="text-dim">
                    Kwota netto
                    <input inputMode="decimal" value={fKwotaNetto} onChange={(e) => setFKwotaNetto(e.target.value)} placeholder="0,00" className={`${inputCls} tabular-nums`} />
                  </label>
                  <label className="text-dim">
                    VAT %
                    <select
                      value={fVat}
                      onChange={(e) => {
                        const next = e.target.value as VatRate | "";
                        setFVat(next);
                        przeliczVatZBrutto(fKwota, next);
                      }}
                      className={inputCls}
                    >
                      <option value="">do sprawdzenia</option>
                      {VAT_OPTIONS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                  </label>
                  <label className="text-dim">
                    Kwota VAT
                    <input inputMode="decimal" value={fVatKwota} onChange={(e) => setFVatKwota(e.target.value)} placeholder="0,00" className={`${inputCls} tabular-nums`} />
                  </label>
                  <label className="text-dim">
                    {t.fuel.grossAmount}
                    <input
                      inputMode="decimal"
                      value={fKwota}
                      onChange={(e) => {
                        setFKwota(e.target.value);
                        przeliczVatZBrutto(e.target.value, fVat);
                      }}
                      placeholder="0,00"
                      className={`${inputCls} tabular-nums font-bold text-white`}
                    />
                  </label>
                  <label className="text-dim col-span-2">
                    Przebieg pojazdu (km)
                    <input inputMode="decimal" value={fPrzebieg} onChange={(e) => setFPrzebieg(e.target.value)} placeholder="np. 245320,8" className={`${inputCls} tabular-nums`} />
                  </label>
                  {mileageSuggestion && (
                    <p className="col-span-2 rounded-xl border border-amber-brand/35 bg-amber-brand/10 px-3 py-2 text-[11px] text-amber-brand">
                      {mileageSuggestion}
                    </p>
                  )}
                  <label className="text-dim">
                    Status tacho
                    <input value={fTachoStatus} onChange={(e) => setFTachoStatus(e.target.value.toUpperCase())} placeholder="np. OUT" className={inputCls} />
                  </label>
                  <label className="text-dim">
                    Prędkość
                    <input inputMode="decimal" value={fSpeed} onChange={(e) => setFSpeed(e.target.value)} placeholder="0" className={`${inputCls} tabular-nums`} />
                  </label>
                  <label className="text-dim col-span-2">
                    Nr dokumentu
                    <input value={fDokument} onChange={(e) => setFDokument(e.target.value)} placeholder="opcjonalnie" className={inputCls} />
                  </label>
                  <label className="text-dim col-span-2">
                    Notatka
                    <textarea value={fNotatka} onChange={(e) => setFNotatka(e.target.value)} placeholder="opcjonalnie" className={`${inputCls} min-h-[72px] resize-none`} />
                  </label>
                </div>
              </div>

              {outsideMainRange && (
                <div className="rounded-xl border border-amber-brand/45 bg-amber-brand/10 p-3 text-xs text-amber-brand">
                  <IconAlertTriangle size={13} className="mr-1 inline" />
                  Data z paragonu jest spoza głównego zakresu rozliczeń 2026. Tankowanie zostanie wysłane do admina jako historyczne i domyślnie nie wejdzie do raportów.
                </div>
              )}

              {duplicateWarning && (
                <div className="rounded-xl border border-amber-brand/50 bg-amber-brand/10 p-3 text-xs text-amber-brand">
                  <p className="font-bold">{duplicateWarning}</p>
                  <button
                    type="button"
                    onClick={() => zapisz(true)}
                    disabled={busy}
                    className="mt-2 rounded-lg bg-amber-brand px-3 py-1.5 font-bold text-amber-ink disabled:opacity-50"
                  >
                    Zapisz mimo ostrzeżenia
                  </button>
                </div>
              )}

              {blad && (
                <p className="flex items-center gap-1.5 text-xs text-red-300">
                  <IconX size={13} /> {blad}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={requestClose}
                  disabled={busy}
                  className="flex-1 py-2 rounded-xl border border-line text-dim text-sm hover:text-ink disabled:opacity-50"
                >
                  {t.fuel.cancel}
                </button>
                <button
                  type="button"
                  onClick={() => zapisz(false)}
                  disabled={busy}
                  className="flex-1 py-2 rounded-xl bg-amber-brand text-amber-ink font-bold text-sm hover:bg-[#e09420] disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {busy ? <IconLoader size={14} /> : <IconCheck size={14} />}
                  {t.fuel.save}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {confirmDiscard && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          data-swipe-ignore="true"
        >
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-2xl">
            <div className="mb-3 flex items-center gap-2">
              <IconAlertTriangle size={18} className="text-amber-brand" />
              <h3 className="text-base font-bold text-white">Masz niezapisane zmiany</h3>
            </div>
            <p className="text-sm text-dim">
              Co zrobić z danymi tankowania, których jeszcze nie zapisałeś?
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmDiscard(false)}
                className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-dim hover:text-ink"
              >
                Zostań
              </button>
              <button
                type="button"
                onClick={forceClose}
                className="rounded-xl bg-red-500/90 px-3 py-2 text-sm font-bold text-white hover:bg-red-500"
              >
                Odrzuć zmiany
              </button>
            </div>
          </div>
        </div>
      )}

      {ostatniWynik && (
        <div className="mt-4 rounded-2xl border border-green-500/35 bg-green-soft/50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <IconRoad size={15} className="text-green-300" />
            <p className="text-xs font-bold uppercase tracking-wide text-green-300">Tankowanie wysłane do zatwierdzenia</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <span className="text-dim">Przejechano<br /><b className="text-ink">{formatMaybeNumber(ostatniWynik.kmSinceLastFuel, " km")}</b></span>
            <span className="text-dim">Zatankowano<br /><b className="text-ink">{formatMaybeNumber(ostatniWynik.litry, " L")}</b></span>
            <span className="text-dim">Paliwo przed tankowaniem<br /><b className="text-ink">{formatMaybeNumber(ostatniWynik.fuelBeforeRefuelLiters, " L")}</b></span>
            <span className="text-dim">Spalanie<br /><b className="text-ink">{formatMaybeNumber(ostatniWynik.fuelConsumptionLPer100Km, " L/100 km")}</b></span>
            <span className="text-dim">Brutto/km<br /><b className="text-ink">{formatMaybeNumber(ostatniWynik.costPerKmGross, " zł/km")}</b></span>
            <span className="text-dim">Netto/km<br /><b className="text-ink">{formatMaybeNumber(ostatniWynik.costPerKmNet, " zł/km")}</b></span>
          </div>
          <p className="mt-2 rounded-lg border border-line bg-surface2 px-2 py-1 text-[11px] font-bold text-amber-brand">
            Status: {fuelStatusLabel(ostatniWynik.fuelStatus)}
          </p>
        </div>
      )}

      {lista.length > 0 && (
        <div className="mt-4 pt-3 border-t border-line/60">
          <p className="text-[11px] font-semibold text-dim uppercase tracking-wide mb-1">{t.fuel.yourFuel}</p>
          <div className="divide-y divide-line/40">
            {lista.map((w) => (
              <div key={w.id} className="py-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink tabular-nums">
                      {formatZlCaly(w.koszt)}
                      {w.litry ? <span className="text-dim"> · {w.litry} l</span> : null}
                    </p>
                    <p className="text-[11px] text-dim">
                      {ddmm(w.data)} · {driverMonthName(lang, w.miesiac)}
                      {w.supplierName || w.stationName ? ` · ${w.supplierName ?? w.stationName}` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                      {w.odometerKm ? <span className="rounded-full border border-line px-2 py-0.5 text-dim">{w.odometerKm} km</span> : null}
                      {w.tachoStatus ? <span className="rounded-full border border-line px-2 py-0.5 text-dim">Tacho {w.tachoStatus}</span> : null}
                      {w.isHistorical ? <span className="rounded-full border border-amber-brand/40 px-2 py-0.5 text-amber-brand">historyczne</span> : null}
                      {w.kmSinceLastFuel ? <span className="rounded-full border border-line px-2 py-0.5 text-dim">{w.kmSinceLastFuel} km od ost.</span> : null}
                      {w.fuelConsumptionLPer100Km ? <span className="rounded-full border border-line px-2 py-0.5 text-dim">{w.fuelConsumptionLPer100Km} L/100</span> : null}
                      <span className={`rounded-full border px-2 py-0.5 ${
                        w.fuelStatus === "ok" ? "border-green-500/40 text-green-300" : "border-amber-brand/40 text-amber-brand"
                      }`}>
                        {fuelStatusLabel(w.fuelStatus)}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 ${
                        w.status === "approved"
                          ? "border-green-500/40 text-green-300"
                          : w.status === "rejected"
                          ? "border-red-500/40 text-red-300"
                          : "border-amber-brand/40 text-amber-brand"
                      }`}>
                        {w.status === "approved" ? "Zatwierdzone" : w.status === "rejected" ? "Odrzucone" : "Do sprawdzenia"}
                      </span>
                    </div>
                    {w.zalaczniki?.length ? (
                      <div className="mt-1 flex flex-wrap gap-2">
                        <ZalacznikPreview
                          zalaczniki={w.zalaczniki.filter((z) => z.typ === "dokument")}
                          label="Paragon"
                          compact
                        />
                        <ZalacznikPreview
                          zalaczniki={w.zalaczniki.filter((z) => z.typ === "licznik")}
                          label="Licznik / tacho"
                          emptyLabel=""
                          compact
                        />
                      </div>
                    ) : null}
                  </div>

                  {w.zamkniety || (w.status ?? "approved") !== "pending" ? (
                    <span className="shrink-0 flex items-center gap-1 text-[10px] text-dim">
                      <IconLock size={12} /> {w.zamkniety ? t.fuel.closed : "wysłane"}
                    </span>
                  ) : confirmId === w.id ? (
                    <div className="shrink-0 flex items-center gap-1.5">
                      <span className="text-[11px] text-dim">{t.fuel.sure}</span>
                      <button
                        type="button"
                        onClick={() => usun(w)}
                        disabled={delBusyId === w.id}
                        className="px-2 py-1 rounded-lg bg-red-500/90 hover:bg-red-500 text-white text-[11px] font-bold disabled:opacity-50 flex items-center gap-1"
                      >
                        {delBusyId === w.id ? <IconLoader size={11} /> : null} {t.fuel.delete}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        disabled={delBusyId === w.id}
                        className="px-2 py-1 rounded-lg border border-line text-dim text-[11px] hover:text-ink"
                      >
                        {t.fuel.no}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmId(w.id)}
                      title={t.fuel.deleteTitle}
                      className="shrink-0 p-2 rounded-lg text-red-400 hover:bg-red-soft transition-colors"
                    >
                      <IconTrash size={16} />
                    </button>
                  )}
                </div>
                {w.reviewReasons?.length ? (
                  <div className="mt-2 rounded-lg border border-amber-brand/30 bg-amber-brand/10 px-2 py-1.5 text-[10px] text-amber-brand">
                    <IconAlertTriangle size={11} className="mr-1 inline" />
                    {w.reviewReasons[0]}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
