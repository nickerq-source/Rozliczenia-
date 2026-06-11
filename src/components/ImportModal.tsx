"use client";

// Modal po wgraniu PDF: podsumowanie importu lub komunikat o braku danych

import { useEffect } from "react";
import { KIEROWCA, TYP_TRANSPORTU } from "@/lib/config";
import { formatZl } from "@/lib/business-logic";
import { cn } from "@/lib/utils";

interface FilteredResult {
  ileKolek: number;
  sumaKm: number;
  netto: number;
  brutto: number;
  sredniaKm: number;
  sredniaNetto: number;
  sredniaBrutto: number;
  zakresOd: string | null; // YYYY-MM-DD
  zakresDo: string | null;
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
  onConfirm: () => void;
  onCancel: () => void;
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
  onRemove,
  onReupload,
}: ImportModalProps) {
  const isPreview = mode === "preview";
  // Zamknij modal klawiszem Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const noMatch = filtered === null;

  return (
    // Tło nakładki
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-sm bg-surface rounded-2xl border border-line shadow-2xl overflow-hidden">
        {/* Nagłówek */}
        <div className="px-5 py-4 border-b border-line bg-surface2">
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

        <div className="px-5 py-4">
          {noMatch ? (
            /* ── BRAK WYNIKÓW ── */
            <p className="text-zinc-300 text-sm leading-relaxed">
              {message ?? `W tym PDF nie znaleziono tras dla ${KIEROWCA} (${TYP_TRANSPORTU}).`}
            </p>
          ) : (
            /* ── WYNIKI ── */
            <div className="space-y-1">
              <div className="text-xs text-zinc-500 space-y-0.5 mb-3">
                <p>Kierowca: <span className="text-zinc-300">{KIEROWCA}</span></p>
                <p>Typ transportu: <span className="text-zinc-300">{TYP_TRANSPORTU}</span></p>
                {filtered!.zakresOd && (
                  <p>
                    Zakres:{" "}
                    <span className="text-zinc-300">
                      {isoToDisplay(filtered!.zakresOd)} – {isoToDisplay(filtered!.zakresDo)}
                    </span>
                  </p>
                )}
              </div>

              <Row label="Kółka (trasy)" value={String(filtered!.ileKolek)} />
              <Row label="Suma km" value={`${filtered!.sumaKm} km`} />
              <Row label="Średnia km/kółko" value={`${filtered!.sredniaKm} km`} />

              <div className="pt-1" />

              <Row label="Zarobek netto" value={formatZl(filtered!.netto)} />
              <Row label="Zarobek brutto" value={formatZl(filtered!.brutto)} accent />
              <Row label="Średnia netto/kółko" value={formatZl(filtered!.sredniaNetto)} />
              <Row label="Średnia brutto/kółko" value={formatZl(filtered!.sredniaBrutto)} />

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
          <div className="px-5 pb-5">
            <button
              onClick={onCancel}
              className="w-full py-2.5 rounded-xl bg-zinc-700 text-white font-medium text-sm hover:bg-zinc-600 transition-colors"
            >
              OK
            </button>
          </div>
        ) : isPreview ? (
          <div className="px-5 pb-5 flex flex-col gap-2">
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
          <div className="px-5 pb-5 flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 font-medium text-sm hover:bg-zinc-700 transition-colors"
            >
              Anuluj
            </button>
            <button
              onClick={onConfirm}
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
