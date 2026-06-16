"use client";

// Część B — dodanie kosztu ze zdjęcia paragonu/faktury (OCR przez AI).
// Przycisk → aparat/plik → /api/scan-receipt → modal z polami do sprawdzenia → zapis.

import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  KategoriaKosztu,
  KosztPayer,
  KosztZalacznik,
  UstawieniaPodatkowe,
  VatRate,
  WpisInnegoKosztu,
  WpisTankowania,
} from "@/lib/types";
import { imageToCompressedDataUrl } from "@/lib/image";
import {
  ReceiptScanResult,
  receiptHasImportantData,
  scanReceiptDataUrl,
} from "@/lib/receipt-scan-client";
import { kategoryzujLokalnie } from "@/lib/categorize";
import { KATEGORIE, domyslnyVatKategorii } from "@/lib/tax";
import { IconCamera, IconLoader, IconAlertTriangle, IconX } from "./ui/icons";

const STAWKI: { id: VatRate; label: string }[] = [
  { id: "0.23", label: "23%" },
  { id: "0.08", label: "8%" },
  { id: "0.05", label: "5%" },
  { id: "0", label: "0%" },
  { id: "zw", label: "zw." },
  { id: "np", label: "np." },
];

const PLATNICY: { id: KosztPayer; label: string }[] = [
  { id: "Firma", label: "Firma" },
  { id: "Artur", label: "Artur" },
  { id: "Damian", label: "Damian" },
];

interface Props {
  typ: "inne" | "tankowanie";
  ustawienia: UstawieniaPodatkowe;
  onZapisz: (wpis: WpisInnegoKosztu | WpisTankowania) => void;
  disabled?: boolean;
}

export function SkanParagonu({ typ, ustawienia, onZapisz, disabled }: Props) {
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<null | {
    dataUrl: string;
    odczyt: ReceiptScanResult;
  }>(null);

  // Pola formularza (edytowalne)
  const [fData, setFData] = useState("");
  const [fNazwa, setFNazwa] = useState("");
  const [fSprzedawca, setFSprzedawca] = useState("");
  const [fNip, setFNip] = useState("");
  const [fKwota, setFKwota] = useState("");
  const [fLitry, setFLitry] = useState("");
  const [fCena, setFCena] = useState("");
  const [fVat, setFVat] = useState<VatRate>("0.23");
  const [fKat, setFKat] = useState<KategoriaKosztu>("inne");
  const [fPaidBy, setFPaidBy] = useState<KosztPayer>("Firma");

  const parseDecimal = (v: string) => {
    const n = parseFloat(v.replace(",", "."));
    return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined;
  };

  async function onPlik(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await imageToCompressedDataUrl(file, 2000, 0.84);
      const odczyt = await scanReceiptDataUrl(dataUrl, file.name);

      // Pre-fill formularza
      const nazwa = odczyt.nazwa ?? odczyt.fuelType ?? "";
      const reg = kategoryzujLokalnie(nazwa);
      const kat = typ === "tankowanie" ? "paliwo_adblue" : reg ?? "inne";
      setFData(odczyt.data ?? "");
      setFNazwa(nazwa);
      setFSprzedawca(odczyt.sprzedawca ?? "");
      setFNip(odczyt.nip ?? "");
      setFKwota(odczyt.kwotaBrutto != null ? String(odczyt.kwotaBrutto) : "");
      setFLitry(odczyt.litry != null ? String(odczyt.litry) : "");
      setFCena(odczyt.cenaZaLitr != null ? String(odczyt.cenaZaLitr) : "");
      setFVat(odczyt.vatRate ?? domyslnyVatKategorii(kat, ustawienia).vatRate);
      setFKat(kat);
      setFPaidBy("Firma");
      setModal({ dataUrl, odczyt });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Nie udało się odczytać zdjęcia. Spróbuj ponownie lub dodaj koszt ręcznie.");
    } finally {
      setBusy(false);
    }
  }

  async function zapisz() {
    const kwota = parseFloat(fKwota.replace(",", "."));
    if (!isFinite(kwota) || kwota <= 0) {
      alert("Podaj kwotę brutto.");
      return;
    }
    setBusy(true);
    // Zdjęcie ląduje w Storage; w JSONB zapisujemy tylko ścieżkę
    let zalacznik: KosztZalacznik | undefined;
    try {
      const up = await fetch("/api/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: modal!.dataUrl }),
      });
      if (up.ok) {
        const { path } = await up.json();
        zalacznik = {
          id: uuidv4(),
          typ: "dokument",
          nazwa: "paragon.jpg",
          mime: "image/jpeg",
          storagePath: path,
          createdAt: new Date().toISOString(),
        };
      }
    } catch {
      // Bez załącznika — koszt i tak zapisujemy
    } finally {
      setBusy(false);
    }
    const defVat = domyslnyVatKategorii(fKat, ustawienia);
    const wspolne = {
      id: uuidv4(),
      data: fData || "",
      koszt: kwota,
      documentStatus: "paragon" as const,
      hasInvoice: true,
      supplierName: fSprzedawca || undefined,
      supplierNip: fNip || undefined,
      invoiceNumber: modal?.odczyt.documentNumber || undefined,
      amountMode: "brutto" as const,
      paidBy: fPaidBy,
      vatRate: fVat,
      vatDeductible: fVat !== "zw" && fVat !== "np",
      vatDeductionPercent: fVat === "zw" || fVat === "np" ? 0 : defVat.vatDeductionPercent,
      kategoria: fKat,
      kategoriaZrodlo: "ai" as const,
      kategoriaPotwierdzona: true, // użytkownik sprawdził w modalu
      vatZrodlo: "ai" as const,
      zalaczniki: zalacznik ? [zalacznik] : [],
    };

    if (typ === "tankowanie") {
      onZapisz({ ...wspolne, litry: parseDecimal(fLitry) } as WpisTankowania);
    } else {
      onZapisz({ ...wspolne, nazwa: fNazwa || "Paragon" } as WpisInnegoKosztu);
    }
    setModal(null);
  }

  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label
          className={`w-full flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-xl border border-dashed border-amber-brand/50 text-sm text-amber-brand transition-all duration-150 ${
            disabled || busy ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-amber-brand/10"
          }`}
        >
          {busy ? <IconLoader size={15} /> : <IconCamera size={15} />}
          {busy ? "Odczytuję…" : "Zrób zdjęcie"}
          <input
            type="file"
            accept="image/*,.heic,.heif"
            capture="environment"
            className="hidden"
            disabled={disabled || busy}
            onChange={onPlik}
          />
        </label>
        <label
          className={`w-full flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-xl border border-dashed border-amber-brand/50 text-sm text-amber-brand transition-all duration-150 ${
            disabled || busy ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-amber-brand/10"
          }`}
        >
          {busy ? <IconLoader size={15} /> : <IconCamera size={15} />}
          {busy ? "Odczytuję…" : "Wybierz z galerii"}
          <input
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            disabled={disabled || busy}
            onChange={onPlik}
          />
        </label>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setModal(null)}>
          <div
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-surface border border-line p-4 space-y-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Koszt ze zdjęcia</h3>
              <button onClick={() => setModal(null)} className="text-dim hover:text-ink"><IconX size={18} /></button>
            </div>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-brand/10 border border-amber-brand/40 text-amber-brand text-[11px] font-medium">
              <IconAlertTriangle size={12} />
              {modal.odczyt._noKey
                ? "AI niedostępne — wpisz dane ręcznie"
                : receiptHasImportantData(modal.odczyt)
                ? "odczytano ze zdjęcia — sprawdź dane"
                : "Nie udało się odczytać danych — wpisz ręcznie"}
            </span>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={modal.dataUrl} alt="paragon" className="w-full max-h-40 object-contain rounded-xl border border-line bg-black/30" />

            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="col-span-2 text-dim">
                Nazwa
                <input value={fNazwa} onChange={(e) => setFNazwa(e.target.value)} placeholder="np. Paliwo Orlen" className="mt-0.5 w-full bg-input border border-line rounded-lg px-2 py-1.5 text-sm text-ink" />
              </label>
              <label className="text-dim">
                Data
                <input type="date" value={fData} onChange={(e) => setFData(e.target.value)} className="mt-0.5 w-full bg-input border border-line rounded-lg px-2 py-1.5 text-sm text-ink" />
              </label>
              <label className="text-dim">
                Kwota brutto
                <input inputMode="decimal" value={fKwota} onChange={(e) => setFKwota(e.target.value)} placeholder="0,00" className="mt-0.5 w-full bg-input border border-line rounded-lg px-2 py-1.5 text-sm text-ink tabular-nums" />
              </label>
              {typ === "tankowanie" && (
                <>
                  <label className="text-dim">
                    Litry
                    <input inputMode="decimal" value={fLitry} onChange={(e) => setFLitry(e.target.value)} placeholder="0" className="mt-0.5 w-full bg-input border border-line rounded-lg px-2 py-1.5 text-sm text-ink tabular-nums" />
                  </label>
                  <label className="text-dim">
                    Cena za litr
                    <input inputMode="decimal" value={fCena} onChange={(e) => setFCena(e.target.value)} placeholder="0,00" className="mt-0.5 w-full bg-input border border-line rounded-lg px-2 py-1.5 text-sm text-ink tabular-nums" />
                  </label>
                </>
              )}
              <label className="text-dim">
                Sprzedawca
                <input value={fSprzedawca} onChange={(e) => setFSprzedawca(e.target.value)} className="mt-0.5 w-full bg-input border border-line rounded-lg px-2 py-1.5 text-sm text-ink" />
              </label>
              <label className="text-dim">
                NIP
                <input value={fNip} onChange={(e) => setFNip(e.target.value)} className="mt-0.5 w-full bg-input border border-line rounded-lg px-2 py-1.5 text-sm text-ink tabular-nums" />
              </label>
              <label className="text-dim">
                Stawka VAT
                <select value={fVat} onChange={(e) => setFVat(e.target.value as VatRate)} className="mt-0.5 w-full bg-input border border-line rounded-lg px-2 py-1.5 text-sm text-ink">
                  {STAWKI.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
              <label className="text-dim">
                Kategoria
                <select value={fKat} onChange={(e) => setFKat(e.target.value as KategoriaKosztu)} className="mt-0.5 w-full bg-input border border-line rounded-lg px-2 py-1.5 text-sm text-ink">
                  {KATEGORIE.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
              </label>
              <label className="text-dim">
                Kto zapłacił?
                <select value={fPaidBy} onChange={(e) => setFPaidBy(e.target.value as KosztPayer)} className="mt-0.5 w-full bg-input border border-line rounded-lg px-2 py-1.5 text-sm text-ink">
                  {PLATNICY.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </label>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setModal(null)} disabled={busy} className="flex-1 py-2 rounded-xl border border-line text-dim text-sm hover:text-ink disabled:opacity-50">Anuluj</button>
              <button onClick={zapisz} disabled={busy} className="flex-1 py-2 rounded-xl bg-amber-brand text-amber-ink font-bold text-sm hover:bg-[#e09420] disabled:opacity-50 flex items-center justify-center gap-1.5">
                {busy ? <IconLoader size={14} /> : null}
                Zapisz koszt
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
