"use client";

// Tankowanie w panelu kierowcy: kierowca wpisuje litry + cenę (lub kwotę),
// albo robi zdjęcie paragonu i AI uzupełnia dane. Wpis trafia przez
// /api/driver/fuel do kosztów admina (rubryka „Tankowanie"). Kierowca widzi
// też listę swoich tankowań i może je usunąć (z potwierdzeniem).

import { useCallback, useEffect, useState } from "react";
import { Card } from "./ui/Card";
import { imageToCompressedDataUrl } from "@/lib/image";
import {
  ReceiptScanResult,
  receiptHasImportantData,
  scanReceiptDataUrl,
} from "@/lib/receipt-scan-client";
import { formatZlCaly } from "@/lib/business-logic";
import {
  IconGasStation,
  IconCamera,
  IconLoader,
  IconCheck,
  IconX,
  IconPlus,
  IconTrash,
  IconLock,
} from "./ui/icons";
import { DriverLanguage, driverMonthName, driverTexts } from "@/lib/driver-translations";

interface WpisListy {
  id: string;
  data: string;
  koszt: number;
  litry?: number;
  miesiac: number;
  nazwaMiesiaca: string;
  zamkniety: boolean;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const num = (s: string): number => parseFloat(s.replace(",", "."));
const ddmm = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

export function TankowanieKierowcy({ lang }: { lang: DriverLanguage }) {
  const t = driverTexts(lang);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanInfo, setScanInfo] = useState<null | "ok" | "manual">(null);
  const [blad, setBlad] = useState<string | null>(null);

  const [lista, setLista] = useState<WpisListy[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [delBusyId, setDelBusyId] = useState<string | null>(null);

  // Pola
  const [fData, setFData] = useState(todayISO());
  const [fLitry, setFLitry] = useState("");
  const [fCena, setFCena] = useState(""); // cena za litr
  const [fKwota, setFKwota] = useState(""); // kwota brutto (razem)
  const [fSprzedawca, setFSprzedawca] = useState("");
  const [fNip, setFNip] = useState("");
  const [fZalacznik, setFZalacznik] = useState<string | null>(null);

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
    const dev = process.env.NODE_ENV !== "production";
    try {
      // Wyższa jakość do OCR (drobny druk paragonu); Claude i tak zmniejszy do ~1568px
      const dataUrl = await imageToCompressedDataUrl(file, 2000, 0.84);
      if (dev) console.log("[tankowanie] wysyłam zdjęcie do OCR, dł. base64:", dataUrl.length);
      const o: ReceiptScanResult = await scanReceiptDataUrl(dataUrl, file.name);
      if (dev) console.log("[tankowanie] OCR odczyt:", o);

      setFZalacznik(dataUrl);

      // Cena za litr: z OCR, a gdy brak — policz z kwoty i litrów
      let cena = o.cenaZaLitr;
      if (cena == null && o.kwotaBrutto != null && o.litry != null && o.litry > 0) {
        cena = Math.round((o.kwotaBrutto / o.litry) * 100) / 100;
      }

      // Ustaw TYLKO pola, które OCR faktycznie odczytał — nie zerujemy reszty
      if (o.data) setFData(o.data);
      if (o.sprzedawca) setFSprzedawca(o.sprzedawca);
      if (o.nip) setFNip(o.nip);
      if (o.litry != null) setFLitry(String(o.litry));
      if (cena != null) setFCena(String(cena));
      if (o.kwotaBrutto != null) setFKwota(String(o.kwotaBrutto));
      else if (o.litry != null && cena != null) {
        setFKwota(String(Math.round(o.litry * cena * 100) / 100));
      }

      // „Odczytano" tylko gdy realnie wpadło ≥1 ważne pole
      const cosOdczytano = receiptHasImportantData({ ...o, cenaZaLitr: cena });
      if (o._noKey) {
        setScanInfo("manual");
      } else if (cosOdczytano) {
        setScanInfo("ok");
      } else {
        setScanInfo(null);
        setBlad(t.fuel.readError);
      }
      setOpen(true);
    } catch (error) {
      setBlad(error instanceof Error ? error.message : t.fuel.readError);
      setScanInfo(null);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function zapisz() {
    const kwota = num(fKwota);
    if (!isFinite(kwota) || kwota <= 0) {
      setBlad(t.fuel.amountRequired);
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
        setBlad(json.error ?? t.fuel.saveError);
        return;
      }
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

  return (
    <Card>
      <div className="flex items-center gap-2">
        <IconGasStation size={18} className="text-amber-brand" />
        <h2 className="text-sm font-bold text-white">{t.fuel.title}</h2>
      </div>
      <p className="text-xs text-dim mt-1">
        {t.fuel.intro}
      </p>

      {!open ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { reset(); setOpen(true); }}
            className="flex items-center justify-center gap-1.5 py-2.5 min-h-[44px] rounded-xl border border-dashed border-amber-brand/50 text-sm text-amber-brand hover:bg-amber-brand/10 transition-all"
          >
            <IconPlus size={15} /> {t.fuel.manual}
          </button>
          <label
            className={`flex items-center justify-center gap-1.5 py-2.5 min-h-[44px] rounded-xl border border-dashed border-amber-brand/50 text-sm text-amber-brand transition-all ${
              busy ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-amber-brand/10"
            }`}
          >
            {busy ? <IconLoader size={15} /> : <IconCamera size={15} />}
            {busy ? t.fuel.reading : t.fuel.photo}
            <input
              type="file"
              accept="image/*,.heic,.heif"
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
              {scanInfo === "manual" ? t.fuel.aiManual : t.fuel.aiRead}
            </span>
          )}

          {fZalacznik && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fZalacznik} alt="paragon" className="w-full max-h-36 object-contain rounded-xl border border-line bg-black/30" />
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="text-dim">
              {t.fuel.liters}
              <input
                inputMode="decimal"
                value={fLitry}
                onChange={(e) => { setFLitry(e.target.value); przeliczKwote(e.target.value, fCena); }}
                placeholder="0"
                className={`${inputCls} tabular-nums`}
              />
            </label>
            <label className="text-dim">
              {t.fuel.pricePerLiter}
              <input
                inputMode="decimal"
                value={fCena}
                onChange={(e) => { setFCena(e.target.value); przeliczKwote(fLitry, e.target.value); }}
                placeholder="0,00"
                className={`${inputCls} tabular-nums`}
              />
            </label>
            <label className="text-dim col-span-2">
              {t.fuel.grossAmount}
              <input
                inputMode="decimal"
                value={fKwota}
                onChange={(e) => setFKwota(e.target.value)}
                placeholder="0,00"
                className={`${inputCls} tabular-nums text-base font-bold text-white`}
              />
            </label>
            <label className="text-dim">
              {t.fuel.date}
              <input
                type="date"
                value={fData}
                onChange={(e) => setFData(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="text-dim">
              {t.fuel.station}
              <input
                value={fSprzedawca}
                onChange={(e) => setFSprzedawca(e.target.value)}
                placeholder={t.fuel.stationPlaceholder}
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
              {t.fuel.cancel}
            </button>
            <button
              type="button"
              onClick={zapisz}
              disabled={busy}
              className="flex-1 py-2 rounded-xl bg-amber-brand text-amber-ink font-bold text-sm hover:bg-[#e09420] disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {busy ? <IconLoader size={14} /> : <IconCheck size={14} />}
              {t.fuel.save}
            </button>
          </div>
        </div>
      )}

      {/* Lista własnych tankowań kierowcy — z usuwaniem */}
      {lista.length > 0 && (
        <div className="mt-4 pt-3 border-t border-line/60">
          <p className="text-[11px] font-semibold text-dim uppercase tracking-wide mb-1">{t.fuel.yourFuel}</p>
          <div className="divide-y divide-line/40">
            {lista.map((w) => (
              <div key={w.id} className="flex items-center gap-2 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink tabular-nums">
                    {formatZlCaly(w.koszt)}
                    {w.litry ? <span className="text-dim"> · {w.litry} l</span> : null}
                  </p>
                  <p className="text-[11px] text-dim">{ddmm(w.data)} · {driverMonthName(lang, w.miesiac)}</p>
                </div>

                {w.zamkniety ? (
                  <span className="shrink-0 flex items-center gap-1 text-[10px] text-dim">
                    <IconLock size={12} /> {t.fuel.closed}
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
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
