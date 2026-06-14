"use client";

// Część B — dodanie kosztu ze zdjęcia paragonu/faktury (OCR przez AI).
// Przycisk → aparat/plik → /api/scan-receipt → modal z polami do sprawdzenia → zapis.

import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  KategoriaKosztu,
  KosztZalacznik,
  UstawieniaPodatkowe,
  VatRate,
  WpisInnegoKosztu,
  WpisTankowania,
} from "@/lib/types";
import { imageToCompressedDataUrl } from "@/lib/image";
import { kategoryzujLokalnie } from "@/lib/categorize";
import { KATEGORIE, domyslnyVatKategorii } from "@/lib/tax";
import { IconCamera, IconLoader, IconAlertTriangle, IconX } from "./ui/icons";

interface OdczytParagonu {
  sprzedawca: string | null;
  nip: string | null;
  data: string | null;
  kwotaBrutto: number | null;
  vatRate: VatRate | null;
  nazwa: string | null;
  _noKey?: boolean;
}

const STAWKI: { id: VatRate; label: string }[] = [
  { id: "0.23", label: "23%" },
  { id: "0.08", label: "8%" },
  { id: "0.05", label: "5%" },
  { id: "0", label: "0%" },
  { id: "zw", label: "zw." },
  { id: "np", label: "np." },
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
    odczyt: OdczytParagonu;
  }>(null);

  // Pola formularza (edytowalne)
  const [fData, setFData] = useState("");
  const [fNazwa, setFNazwa] = useState("");
  const [fSprzedawca, setFSprzedawca] = useState("");
  const [fNip, setFNip] = useState("");
  const [fKwota, setFKwota] = useState("");
  const [fVat, setFVat] = useState<VatRate>("0.23");
  const [fKat, setFKat] = useState<KategoriaKosztu>("inne");

  async function onPlik(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await imageToCompressedDataUrl(file);
      const res = await fetch("/api/scan-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const odczyt: OdczytParagonu = res.ok
        ? await res.json()
        : { sprzedawca: null, nip: null, data: null, kwotaBrutto: null, vatRate: null, nazwa: null };

      // Pre-fill formularza
      const nazwa = odczyt.nazwa ?? "";
      const reg = kategoryzujLokalnie(nazwa);
      const kat = reg ?? "inne";
      setFData(odczyt.data ?? "");
      setFNazwa(nazwa);
      setFSprzedawca(odczyt.sprzedawca ?? "");
      setFNip(odczyt.nip ?? "");
      setFKwota(odczyt.kwotaBrutto != null ? String(odczyt.kwotaBrutto) : "");
      setFVat(odczyt.vatRate ?? domyslnyVatKategorii(kat, ustawienia).vatRate);
      setFKat(kat);
      setModal({ dataUrl, odczyt });
    } catch {
      alert("Nie udało się odczytać zdjęcia. Spróbuj ponownie lub dodaj koszt ręcznie.");
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
      invoiceNumber: undefined,
      supplierName: fSprzedawca || undefined,
      supplierNip: fNip || undefined,
      amountMode: "brutto" as const,
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
      onZapisz(wspolne as WpisTankowania);
    } else {
      onZapisz({ ...wspolne, nazwa: fNazwa || "Paragon" } as WpisInnegoKosztu);
    }
    setModal(null);
  }

  return (
    <>
      <label
        className={`mt-3 w-full flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-xl border border-dashed border-amber-brand/50 text-sm text-amber-brand transition-all duration-150 ${
          disabled || busy ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-amber-brand/10"
        }`}
      >
        {busy ? <IconLoader size={15} /> : <IconCamera size={15} />}
        {busy ? "Odczytuję paragon…" : "📷 Dodaj ze zdjęcia (AI)"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={disabled || busy}
          onChange={onPlik}
        />
      </label>

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
              {modal.odczyt._noKey ? "AI niedostępne — wpisz dane ręcznie" : "odczytano ze zdjęcia — sprawdź dane"}
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
