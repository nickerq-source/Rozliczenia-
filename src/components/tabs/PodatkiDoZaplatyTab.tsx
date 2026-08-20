"use client";

// Osobne okno „Podatki do zapłaty" (tylko admin). Prosto: miesiąc + jedna
// finalna kwota (VAT + PIT właściciela + zdrowotna właściciela + podatek,
// zdrowotna i ZUS pracownika) + znacznik „opłacone" per miesiąc. Ręczny ślad,
// NIE zmienia żadnych wyliczeń.

import { useMemo } from "react";
import { WorkspaceData, MiesiącId } from "@/lib/types";
import { podatkiRoku } from "@/lib/tax";
import { formatZl } from "@/lib/business-logic";
import { POLSKIE_MIESIACE } from "@/lib/dates";
import { Card, CardTitle } from "../ui/Card";
import { IconMoneybag, IconCheck } from "../ui/icons";
import { cn } from "@/lib/utils";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function PodatkiDoZaplatyTab({
  data,
  onToggle,
}: {
  data: WorkspaceData;
  onToggle: (miesiac: MiesiącId, oplacono: boolean) => void;
}) {
  const wiersze = useMemo(() => {
    // VAT: nadwyżka (VAT z kosztów > VAT ze sprzedaży) przechodzi na kolejny
    // miesiąc i pomniejsza tam VAT do zapłaty. PIT/strata już liczy się
    // narastająco w silniku, więc nie ruszamy.
    let vatNadwyzka = 0;
    return podatkiRoku(data)
      .map((p) => {
        // VAT gdyby bez przeniesienia nadwyżki (sam ten miesiąc):
        const vatBezNadwyzki = Math.max(0, r2(p.vatNalezny - p.vatNaliczony));
        // z przeniesieniem nadwyżki z poprzednich miesięcy:
        const dostepnyVat = vatNadwyzka + p.vatNaliczony;
        const vatDoZaplaty = Math.max(0, r2(p.vatNalezny - dostepnyVat));
        const uzytaNadwyzka = Math.max(0, r2(vatBezNadwyzki - vatDoZaplaty)); // ile nadwyżka zmniejszyła VAT
        vatNadwyzka = Math.max(0, r2(dostepnyVat - p.vatNalezny));
        return {
          miesiac: p.miesiac,
          razem: r2(
            vatDoZaplaty +
              p.pitMiesiac +
              p.zdrowotna +
              p.podatekDochodowyPracownika +
              p.skladkaZdrowotnaPracownika +
              p.pozostaleSkladkiZusPracownika
          ),
          nadwyzkaVatDalej: vatNadwyzka,
          uzytaNadwyzka,
          oplacono: !!data.podatkiOplacone?.[p.miesiac]?.oplacono,
        };
      })
      .filter((w) => w.razem > 0 || w.nadwyzkaVatDalej > 0 || w.uzytaNadwyzka > 0);
  }, [data]);

  const sumaWszystko = r2(wiersze.reduce((s, w) => s + w.razem, 0));
  const sumaOplacone = r2(wiersze.filter((w) => w.oplacono).reduce((s, w) => s + w.razem, 0));
  const sumaDoZaplaty = r2(sumaWszystko - sumaOplacone);

  return (
    <Card>
      <div className="mb-3 flex items-start gap-2">
        <IconMoneybag size={18} className="mt-0.5 text-amber-brand" />
        <div className="min-w-0 flex-1">
          <CardTitle className="mb-1">Podatki do zapłaty</CardTitle>
          <p className="text-[11px] text-dim">
            Jedna kwota za miesiąc (VAT + dochodowy i zdrowotna właściciela + podatek, zdrowotna i ZUS
            pracownika). Nadwyżka VAT ze stratnego miesiąca przechodzi na kolejny i pomniejsza kwotę.
            Zaznacz, które miesiące już opłaciłeś. Szacunkowo — potwierdza księgowa.
          </p>
        </div>
      </div>

      {/* Podsumowanie */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface2 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-dim">Łącznie</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums text-white">{formatZl(sumaWszystko)}</p>
        </div>
        <div className="rounded-2xl border border-green-500/35 bg-green-soft p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-green-300">Opłacone</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums text-green-200">{formatZl(sumaOplacone)}</p>
        </div>
        <div className="rounded-2xl border border-amber-brand/40 bg-amber-brand/10 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-brand">Do zapłaty</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums text-amber-brand">{formatZl(sumaDoZaplaty)}</p>
        </div>
      </div>

      {/* Lista miesięcy — miesiąc + kwota + status */}
      {wiersze.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface2/60 px-3 py-6 text-center text-sm text-dim">
          Brak podatków do zapłaty w dostępnych miesiącach.
        </p>
      ) : (
        <div className="space-y-2">
          {wiersze.map((w) => (
            <button
              key={w.miesiac}
              type="button"
              onClick={() => onToggle(w.miesiac, !w.oplacono)}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors",
                w.oplacono
                  ? "border-green-500/40 bg-green-soft/50 hover:bg-green-soft"
                  : "border-line bg-surface2 hover:border-amber-brand/50"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                  w.oplacono
                    ? "border-green-500/50 bg-green-500/20 text-green-300"
                    : "border-line text-dim"
                )}
              >
                {w.oplacono ? <IconCheck size={16} /> : ""}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-extrabold text-white">{POLSKIE_MIESIACE[w.miesiac]} 2026</span>
                {w.uzytaNadwyzka > 0 && (
                  <span className="block text-[10px] font-semibold text-green-300">
                    VAT −{formatZl(w.uzytaNadwyzka)} (nadwyżka z poprzedniego miesiąca)
                  </span>
                )}
                {w.nadwyzkaVatDalej > 0 && (
                  <span className="block text-[10px] text-dim">
                    nadwyżka VAT na kolejny miesiąc: {formatZl(w.nadwyzkaVatDalej)}
                  </span>
                )}
              </span>
              <span className="text-right">
                <span
                  className={cn(
                    "block text-lg font-extrabold tabular-nums",
                    w.oplacono ? "text-green-300 line-through" : "text-amber-brand"
                  )}
                >
                  {formatZl(w.razem)}
                </span>
                <span className={cn("text-[10px] font-bold uppercase tracking-wide", w.oplacono ? "text-green-300" : "text-dim")}>
                  {w.oplacono ? "opłacone" : "do zapłaty"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
