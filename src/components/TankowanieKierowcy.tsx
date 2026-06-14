"use client";

// Tankowanie w panelu kierowcy: kierowca wpisuje litry + cenę (lub kwotę),
// albo robi zdjęcie paragonu i AI uzupełnia dane. Wpis trafia przez
// /api/driver/fuel do kosztów admina (rubryka „Tankowanie").

import { useState } from "react";
import { Card } from "./ui/Card";
import { imageToCompressedDataUrl } from "@/lib/image";
import { formatZlCaly } from "@/lib/business-logic";
import {
  IconGasStation,
  IconCamera,
  IconLoader,
  IconCheck,
  IconX,
  IconPlus,
} from "./ui/icons";

interface OdczytParagonu {
  sprzedawca: string | null;
  nip: string | null;
  data: string | null;
  kwotaBrutto: number | null;
  vatRate: string | null;
  nazwa: string | null;
  litry: number | null;
  _noKey?: boolean;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const num = (s: string): number => parseFloat(s.replace(",", "."));

export function TankowanieKierowcy() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanInfo, setScanInfo] = useState<null | "ok" | "manual">(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [ostatnie, setOstatnie] = useState<string[]>([]);

  // Pola
  const [fData, setFData] = useState(todayISO());
  const [fLitry, setFLitry] = useState("");
  const [fCena, setFCena] = useState(""); // cena za litr
  const [fKwota, setFKwota] = useState(""); // kwota brutto (razem)
  const [fSprzedawca, setFSprzedawca] = useState("");
  const [fNip, setFNip] = useState("");
  const [fZalacznik, setFZalacznik] = useState<string | null>(null);

  function reset() {
    setFData(todayISO());
    setFLitry("");
    setFCena("");
    setFKwota("");
    setFSprzedawca("");
    setFNip("");
    setFZalacznik(null);
    setScanInfo(null);
    setBlad(null);
  }

  // Litry × cena/l → kwota (gdy oba podane)
  function przeliczKwote(litryStr: string, cenaStr: string) {
    const l = num(litryStr);
    const c = num(cenaStr);
    if (isFinite(l) && l > 0 && isFinite(c) && c > 0) {
      setFKwota(String(Math.round(l * c * 100) / 100));
    }
  }

  async function onZdjecie(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    setBusy(true);
    setBlad(null);
    try {
      const dataUrl = await imageToCompressedDataUrl(file);
      const res = await fetch("/api/scan-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const o: OdczytParagonu = res.ok
        ? await res.json()
        : { sprzedawca: null, nip: null, data: null, kwotaBrutto: null, vatRate: null, nazwa: null, litry: null };

      setFZalacznik(dataUrl);
      setFData(o.data ?? todayISO());
      setFSprzedawca(o.sprzedawca ?? "");
      setFNip(o.nip ?? "");
      setFKwota(o.kwotaBrutto != null ? String(o.kwotaBrutto) : "");
      setFLitry(o.litry != null ? String(o.litry) : "");
      // Cena za litr z odczytu (gdy mamy oba)
      if (o.kwotaBrutto != null && o.litry != null && o.litry > 0) {
        setFCena(String(Math.round((o.kwotaBrutto / o.litry) * 100) / 100));
      } else {
        setFCena("");
      }
      setScanInfo(o._noKey ? "manual" : "ok");
      setOpen(true);
    } catch {
      setBlad("Nie udało się odczytać zdjęcia. Wpisz dane ręcznie.");
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function zapisz() {
    const kwota = num(fKwota);
    if (!isFinite(kwota) || kwota <= 0) {
      setBlad("Podaj kwotę tankowania (zł).");
      return;
    }
    const litry = num(fLitry);
    setBusy(true);
    setBlad(null);
    try {
      const res = await fetch("/api/driver/fuel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: fData,
          koszt: kwota,
          litry: isFinite(litry) && litry > 0 ? litry : undefined,
          sprzedawca: fSprzedawca || undefined,
          nip: fNip || undefined,
          zalacznik: fZalacznik || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBlad(json.error ?? "Nie udało się zapisać tankowania.");
        return;
      }
      const litryTxt = isFinite(litry) && litry > 0 ? ` · ${litry} l` : "";
      setOstatnie((p) => [`${formatZlCaly(kwota)}${litryTxt}`, ...p].slice(0, 5));
      reset();
      setOpen(false);
    } catch {
      setBlad("Błąd połączenia. Spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "mt-0.5 w-full bg-input border border-line rounded-lg px-2.5 py-2 text-sm text-ink placeholder:text-dim/40";

  return (
    <Card>
      <div className="flex items-center gap-2">
        <IconGasStation size={18} className="text-amber-brand" />
        <h2 className="text-sm font-bold text-white">Tankowanie</h2>
      </div>
      <p className="text-xs text-dim mt-1">
        Wpisz litry i cenę albo zrób zdjęcie paragonu — reszta sama trafi do rozliczenia.
      </p>

      {/* Potwierdzenia ostatnio dodanych w tej sesji */}
      {ostatnie.length > 0 && (
        <div className="mt-2 space-y-1">
          {ostatnie.map((t, i) => (
            <p key={i} className="flex items-center gap-1.5 text-xs text-green-300">
              <IconCheck size={13} /> Dodano: {t}
            </p>
          ))}
        </div>
      )}

      {!open ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { reset(); setOpen(true); }}
            className="flex items-center justify-center gap-1.5 py-2.5 min-h-[44px] rounded-xl border border-dashed border-amber-brand/50 text-sm text-amber-brand hover:bg-amber-brand/10 transition-all"
          >
            <IconPlus size={15} /> Wpisz ręcznie
          </button>
          <label
            className={`flex items-center justify-center gap-1.5 py-2.5 min-h-[44px] rounded-xl border border-dashed border-amber-brand/50 text-sm text-amber-brand transition-all ${
              busy ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-amber-brand/10"
            }`}
          >
            {busy ? <IconLoader size={15} /> : <IconCamera size={15} />}
            {busy ? "Odczytuję…" : "Ze zdjęcia"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={busy}
              onChange={onZdjecie}
            />
          </label>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {scanInfo && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-brand/10 border border-amber-brand/40 text-amber-brand text-[11px] font-medium">
              <IconCheck size={12} />
              {scanInfo === "manual" ? "AI niedostępne — wpisz dane" : "Odczytano ze zdjęcia — sprawdź"}
            </span>
          )}

          {fZalacznik && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fZalacznik} alt="paragon" className="w-full max-h-36 object-contain rounded-xl border border-line bg-black/30" />
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="text-dim">
              Litry
              <input
                inputMode="decimal"
                value={fLitry}
                onChange={(e) => { setFLitry(e.target.value); przeliczKwote(e.target.value, fCena); }}
                placeholder="0"
                className={`${inputCls} tabular-nums`}
              />
            </label>
            <label className="text-dim">
              Cena za litr (zł)
              <input
                inputMode="decimal"
                value={fCena}
                onChange={(e) => { setFCena(e.target.value); przeliczKwote(fLitry, e.target.value); }}
                placeholder="0,00"
                className={`${inputCls} tabular-nums`}
              />
            </label>
            <label className="text-dim col-span-2">
              Kwota brutto (razem)
              <input
                inputMode="decimal"
                value={fKwota}
                onChange={(e) => setFKwota(e.target.value)}
                placeholder="0,00"
                className={`${inputCls} tabular-nums text-base font-bold text-white`}
              />
            </label>
            <label className="text-dim">
              Data
              <input
                type="date"
                value={fData}
                onChange={(e) => setFData(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="text-dim">
              Stacja (opcjonalnie)
              <input
                value={fSprzedawca}
                onChange={(e) => setFSprzedawca(e.target.value)}
                placeholder="np. Orlen"
                className={inputCls}
              />
            </label>
          </div>

          {blad && (
            <p className="flex items-center gap-1.5 text-xs text-red-300">
              <IconX size={13} /> {blad}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { reset(); setOpen(false); }}
              disabled={busy}
              className="flex-1 py-2 rounded-xl border border-line text-dim text-sm hover:text-ink disabled:opacity-50"
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={zapisz}
              disabled={busy}
              className="flex-1 py-2 rounded-xl bg-amber-brand text-amber-ink font-bold text-sm hover:bg-[#e09420] disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {busy ? <IconLoader size={14} /> : <IconCheck size={14} />}
              Zapisz tankowanie
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
