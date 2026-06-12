"use client";

// Karta „Podatki — szacunek" dla aktywnego miesiąca (VAT / PIT / zdrowotna / zysk).

import { PodatkiMiesiaca } from "@/lib/tax";
import { formatZl } from "@/lib/business-logic";
import { Card } from "./ui/Card";
import { IconMoneybag } from "./ui/icons";
import { cn } from "@/lib/utils";

function Wiersz({ label, value, klasa, bold }: { label: string; value: number; klasa?: string; bold?: boolean }) {
  return (
    <div className={cn("flex justify-between text-sm py-1", bold && "font-bold pt-1.5 border-t border-line")}>
      <span className={bold ? "text-white" : "text-dim"}>{label}</span>
      <span className={cn("tabular-nums", klasa ?? (bold ? "text-white" : "text-ink"))}>{formatZl(value)}</span>
    </div>
  );
}

export function PodatkiCard({ p, taxForm }: { p: PodatkiMiesiaca; taxForm: "skala" | "liniowy" }) {
  const nadwyzka = p.vatDoZaplaty < 0;
  const strata = p.dochod < 0;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <IconMoneybag size={18} className="text-amber-brand" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-dim">Podatki — szacunek</h3>
      </div>
      <p className="text-[11px] text-dim/60 mb-3">
        Szacunek pomocniczy — ostateczne rozliczenie potwierdza księgowa.
      </p>

      {/* VAT */}
      <p className="text-xs font-bold uppercase tracking-wider text-amber-brand mb-1">VAT</p>
      <Wiersz label="Należny (sprzedaż)" value={p.vatNalezny} />
      <Wiersz label="Naliczony (koszty, do odliczenia)" value={p.vatNaliczony} />
      {nadwyzka ? (
        <Wiersz label="Nadwyżka VAT do przeniesienia/zwrotu" value={-p.vatDoZaplaty} klasa="text-green-300" bold />
      ) : (
        <Wiersz label="VAT do zapłaty" value={p.vatDoZaplaty} klasa="text-red-300" bold />
      )}

      {/* PIT */}
      <p className="text-xs font-bold uppercase tracking-wider text-amber-brand mb-1 mt-4">
        PIT ({taxForm === "skala" ? "skala" : "liniowy 19%"})
      </p>
      <Wiersz label="Przychód netto" value={p.przychodNetto} />
      <Wiersz label="Koszty podatkowe" value={p.kosztyPodatkowe} />
      {strata ? (
        <Wiersz label="Strata podatkowa" value={-p.dochod} klasa="text-red-300" bold />
      ) : (
        <Wiersz label="Dochód podatkowy" value={p.dochod} bold />
      )}
      <Wiersz label="Dochód narastająco (YTD)" value={p.dochodYtd} />
      <Wiersz label="Zaliczka PIT za miesiąc" value={p.pitMiesiac} klasa="text-red-300" bold />

      {/* Zdrowotna */}
      <p className="text-xs font-bold uppercase tracking-wider text-amber-brand mb-1 mt-4">Zdrowotna</p>
      <Wiersz label="Składka za miesiąc" value={p.zdrowotna} klasa="text-red-300" />

      {/* Zysk */}
      <p className="text-xs font-bold uppercase tracking-wider text-amber-brand mb-1 mt-4">Zysk</p>
      <Wiersz label="Przed podatkami" value={p.zyskPrzedPodatkami} />
      <Wiersz
        label="Po PIT i zdrowotnej"
        value={p.zyskPoPodatkach}
        klasa={p.zyskPoPodatkach >= 0 ? "text-green-300" : "text-red-300"}
        bold
      />
      <Wiersz
        label="Cashflow po podatkach (z VAT)"
        value={p.cashflowPoPodatkach}
        klasa={p.cashflowPoPodatkach >= 0 ? "text-green-300" : "text-red-300"}
      />
    </Card>
  );
}
