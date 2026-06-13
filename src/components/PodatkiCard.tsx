"use client";

// Karta „Na czysto" dla aktywnego miesiąca (koszty / VAT / podatek dochodowy / zdrowotna / zysk).

import { PodatkiMiesiaca } from "@/lib/tax";
import { formatZl } from "@/lib/business-logic";
import { WynikMiesiaca } from "@/lib/types";
import { Card } from "./ui/Card";
import { IconMoneybag } from "./ui/icons";
import { cn } from "@/lib/utils";

function Wiersz({
  label,
  value,
  klasa,
  bold,
  note,
}: {
  label: string;
  value: number;
  klasa?: string;
  bold?: boolean;
  note?: string;
}) {
  return (
    <div className={cn("flex justify-between text-sm py-1", bold && "font-bold pt-1.5 border-t border-line")}>
      <span className={bold ? "text-white" : "text-dim"}>
        {label}
        {note && <span className="block text-[10px] font-normal text-dim/60">{note}</span>}
      </span>
      <span className={cn("tabular-nums", klasa ?? (bold ? "text-white" : "text-ink"))}>{formatZl(value)}</span>
    </div>
  );
}

export function PodatkiCard({
  p,
  taxForm,
  wynik,
}: {
  p: PodatkiMiesiaca;
  taxForm: "skala" | "liniowy";
  wynik: WynikMiesiaca;
}) {
  const nadwyzka = p.vatDoZaplaty < 0;
  const strata = p.dochod < 0;
  const kosztyOperacyjne =
    wynik.wynagrodzeniePracownika + wynik.paliwo + wynik.inne + wynik.leasing;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <IconMoneybag size={18} className="text-amber-brand" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-dim">Na czysto — podatki i koszty</h3>
      </div>
      <p className="text-[11px] text-dim/60 mb-3">
        Szacunek pomocniczy. VAT, podatek dochodowy i zdrowotna zależą od ustawień i kwalifikacji kosztów.
      </p>

      {/* Koszty */}
      <p className="text-xs font-bold uppercase tracking-wider text-amber-brand mb-1">Koszty miesiąca</p>
      <Wiersz label="Wynagrodzenie kierowcy" value={wynik.wynagrodzeniePracownika} />
      <Wiersz label="Paliwo" value={wynik.paliwo} />
      <Wiersz label="Inne koszty" value={wynik.inne} />
      <Wiersz label="Leasing" value={wynik.leasing} />
      <Wiersz label="Razem koszty operacyjne" value={kosztyOperacyjne} bold />

      {/* VAT */}
      <p className="text-xs font-bold uppercase tracking-wider text-amber-brand mb-1 mt-4">VAT</p>
      <Wiersz label="Należny (sprzedaż)" value={p.vatNalezny} />
      <Wiersz label="Netto kosztów z faktur" value={p.kosztyNetto} />
      <Wiersz label="VAT możliwy do odliczenia" value={p.vatNaliczony} klasa="text-green-300" />
      {nadwyzka ? (
        <Wiersz label="Nadwyżka VAT do przeniesienia/zwrotu" value={-p.vatDoZaplaty} klasa="text-green-300" bold />
      ) : (
        <Wiersz label="VAT do zapłaty" value={p.vatDoZaplaty} klasa="text-red-300" bold />
      )}

      {/* Podatek dochodowy */}
      <p className="text-xs font-bold uppercase tracking-wider text-amber-brand mb-1 mt-4">
        Podatek dochodowy ({taxForm === "skala" ? "skala" : "liniowy 19%"})
      </p>
      <Wiersz label="Przychód netto" value={p.przychodNetto} />
      <Wiersz
        label="Koszty podatkowe"
        value={p.kosztyPodatkowe}
        note="tylko koszty z włączonym rozliczeniem podatkowym + wynagrodzenie + leasing"
      />
      {strata ? (
        <Wiersz label="Strata podatkowa" value={-p.dochod} klasa="text-red-300" bold />
      ) : (
        <Wiersz label="Dochód podatkowy" value={p.dochod} bold />
      )}
      <Wiersz label="Dochód narastająco (YTD)" value={p.dochodYtd} />
      <Wiersz label="Zaliczka podatku za miesiąc" value={p.pitMiesiac} klasa="text-red-300" bold />

      {/* Zdrowotna */}
      <p className="text-xs font-bold uppercase tracking-wider text-amber-brand mb-1 mt-4">Zdrowotna</p>
      <Wiersz
        label="Składka za miesiąc"
        value={p.zdrowotna}
        klasa="text-red-300"
        note={taxForm === "skala" ? "domyślnie 9% dochodu, z minimum z ustawień" : "domyślnie 4,9% dochodu, z minimum z ustawień"}
      />

      {/* Zysk */}
      <p className="text-xs font-bold uppercase tracking-wider text-amber-brand mb-1 mt-4">Ile zostaje</p>
      <Wiersz label="Zysk operacyjny przed podatkami" value={p.zyskPrzedPodatkami} />
      <Wiersz
        label="Na czysto po dochodowym i zdrowotnej"
        value={p.zyskPoPodatkach}
        klasa={p.zyskPoPodatkach >= 0 ? "text-green-300" : "text-red-300"}
        bold
      />
      <Wiersz
        label="Gotówka po podatkach i VAT"
        value={p.cashflowPoPodatkach}
        klasa={p.cashflowPoPodatkach >= 0 ? "text-green-300" : "text-red-300"}
        note="odejmuje też VAT do zapłaty; nadwyżka VAT nie jest doliczana jako gotówka"
      />
    </Card>
  );
}
