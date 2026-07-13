"use client";

// Znak „?" przy trudnym pojęciu podatkowym. Na telefonie i desktopie otwiera
// czytelny modal z wyjaśnieniem ze słownika (nazwa, opis, wzór, przykład).

import { useState } from "react";
import { TAX_GLOSSARY, TaxTermId } from "@/lib/taxGlossary";
import { cn } from "@/lib/utils";

export function InfoHint({ term, className }: { term: TaxTermId; className?: string }) {
  const [open, setOpen] = useState(false);
  const t = TAX_GLOSSARY[term];

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`Wyjaśnij: ${t.nazwa}`}
        className={cn(
          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-surface2 text-[11px] font-bold text-dim hover:border-amber-brand/50 hover:text-amber-brand",
          className
        )}
      >
        ?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          data-swipe-ignore="true"
        >
          <div
            className="w-full max-w-md rounded-t-2xl border border-line bg-surface p-4 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <h3 className="text-base font-bold text-white">{t.nazwa}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-lg px-2 py-1 text-sm text-dim hover:text-ink"
              >
                ✕
              </button>
            </div>
            <p className="text-sm leading-relaxed text-ink">{t.opis}</p>
            {t.wzor && (
              <div className="mt-3 rounded-xl border border-line bg-surface2 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-dim">Wzór</p>
                <p className="mt-0.5 text-sm text-amber-brand">{t.wzor}</p>
              </div>
            )}
            {t.przyklad && (
              <div className="mt-2 rounded-xl border border-line bg-surface2 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-dim">Przykład</p>
                <p className="mt-0.5 text-sm text-ink">{t.przyklad}</p>
              </div>
            )}
            <p className="mt-3 text-[11px] text-dim/70">
              Wyliczenia są szacunkowe. Ostateczne rozliczenie potwierdza księgowa.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

// Przycisk „Jak czytać podatki?" — otwiera legendę pogrupowaną (VAT / PIT / …).
const GRUPY: { tytul: string; terms: TaxTermId[] }[] = [
  { tytul: "VAT", terms: ["vat_nalezny", "vat_naliczony", "vat_do_zaplaty", "nadwyzka_vat"] },
  { tytul: "PIT (podatek dochodowy)", terms: ["koszty_pit", "dochod_pit", "koszty_ponad_przychod", "wynik_ytd", "pit_ytd", "pit_miesiac"] },
  { tytul: "Zdrowotna", terms: ["zdrowotna"] },
  { tytul: "Wynik i łącznie", terms: ["wynik_po_podatkach", "lacznie"] },
];

export function JakCzytacPodatki() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-brand/50 px-3 py-1.5 text-xs font-bold text-amber-brand hover:bg-amber-brand/10"
      >
        ? Jak czytać podatki?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 sm:items-center sm:p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          data-swipe-ignore="true"
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-surface p-4 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-base font-bold text-white">Jak czytać podatki?</h3>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-sm text-dim hover:text-ink">
                ✕
              </button>
            </div>
            <p className="mb-3 text-[11px] text-dim/70">
              Wyliczenia są szacunkowe. Ostateczne rozliczenie potwierdza księgowa.
            </p>
            {GRUPY.map((g) => (
              <div key={g.tytul} className="mb-4">
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-amber-brand">{g.tytul}</p>
                <div className="space-y-2">
                  {g.terms.map((id) => {
                    const t = TAX_GLOSSARY[id];
                    return (
                      <div key={id} className="rounded-xl border border-line bg-surface2 p-2.5">
                        <p className="text-sm font-bold text-ink">{t.nazwa}</p>
                        <p className="mt-0.5 text-xs text-dim">{t.opis}</p>
                        {t.wzor && <p className="mt-1 text-[11px] text-amber-brand">Wzór: {t.wzor}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="rounded-xl border border-amber-brand/35 bg-amber-brand/10 p-3">
              <p className="text-xs font-bold text-amber-brand">Prosty przykład</p>
              <p className="mt-1 text-xs leading-relaxed text-ink">
                Firma wystawiła fakturę na 10 000 zł netto + 2 300 zł VAT. Koszty: 6 000 zł netto + VAT.
                <br />Dochód do PIT: 10 000 − 6 000 = 4 000 zł.
                <br />VAT do zapłaty: 2 300 − odliczalny VAT z kosztów.
                <br />Łącznie powinno wyjść: VAT do zapłaty + PIT za miesiąc + zdrowotna.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
