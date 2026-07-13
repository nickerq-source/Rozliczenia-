"use client";

// Karta „Na czysto" — podatki i koszty aktywnego miesiąca.
// Widok prosty (domyślny) odpowiada po ludzku: ile do zapłaty i ile zostaje.
// Szczegóły podatkowe (rozwijane) pokazują pełne rozbicie VAT/PIT/zdrowotnej.

import { useState } from "react";
import { PodatkiMiesiaca } from "@/lib/tax";
import { formatZl } from "@/lib/business-logic";
import { WynikMiesiaca } from "@/lib/types";
import { Card } from "./ui/Card";
import { IconMoneybag } from "./ui/icons";
import { cn } from "@/lib/utils";
import { InfoHint, JakCzytacPodatki } from "./InfoHint";
import { TaxTermId } from "@/lib/taxGlossary";

function Wiersz({
  label,
  value,
  klasa,
  bold,
  note,
  term,
}: {
  label: string;
  value: number;
  klasa?: string;
  bold?: boolean;
  note?: string;
  term?: TaxTermId;
}) {
  return (
    <div className={cn("flex justify-between text-sm py-1", bold && "font-bold pt-1.5 border-t border-line")}>
      <span className={cn("flex items-center gap-1.5", bold ? "text-white" : "text-dim")}>
        <span>
          {label}
          {note && <span className="block text-[10px] font-normal text-dim/60">{note}</span>}
        </span>
        {term && <InfoHint term={term} />}
      </span>
      <span className={cn("tabular-nums shrink-0", klasa ?? (bold ? "text-white" : "text-ink"))}>{formatZl(value)}</span>
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
  const [szczegoly, setSzczegoly] = useState(false);

  const nadwyzka = p.vatDoZaplaty < 0;
  const strata = p.dochod < 0;
  const vatDoZaplatyDodatni = Math.max(0, p.vatDoZaplaty);
  const nadwyzkaVat = Math.max(0, -p.vatDoZaplaty);
  // „Łącznie powinno wyjść" = VAT do zapłaty (nigdy ujemny) + PIT za miesiąc + zdrowotna.
  const laczniePowinnoWyjsc = vatDoZaplatyDodatni + p.pitMiesiac + p.zdrowotna;

  const kosztyOperacyjne =
    wynik.wynagrodzeniePracownika + wynik.zusPracodawcy + wynik.paliwo + wynik.inne + wynik.leasing;
  const oficjalneAktywne = p.wynagrodzeniePodatkowe !== wynik.wynagrodzeniePracownika || p.zusPracodawcy > 0;
  const oficjalnyBrutto = Math.max(0, p.wynagrodzeniePodatkowe - p.zusPracodawcy);
  const nieoficjalne = Math.max(0, wynik.wynagrodzeniePracownika - oficjalnyBrutto);

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconMoneybag size={18} className="text-amber-brand" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-dim">Na czysto — podatki i koszty</h3>
        </div>
        <JakCzytacPodatki />
      </div>
      <p className="mb-3 text-[11px] text-dim/60">
        Wyliczenia są szacunkowe. Ostateczne rozliczenie potwierdza księgowa.
      </p>

      {/* ── WIDOK PROSTY ─────────────────────────────────────────────── */}
      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-amber-brand">Po ludzku</p>
      <Wiersz label="Przychód netto (sprzedaż)" value={p.przychodNetto} />
      <Wiersz label="Koszty uznane do PIT" value={p.kosztyPodatkowe} term="koszty_pit" />
      {strata ? (
        <Wiersz
          label="Koszty przewyższają przychód o"
          value={-p.dochod}
          klasa="text-ink"
          bold
          term="koszty_ponad_przychod"
          note="to nie jest kwota do zapłaty — dlatego PIT za ten miesiąc = 0 zł"
        />
      ) : (
        <Wiersz label="Dochód do PIT" value={p.dochod} bold term="dochod_pit" />
      )}

      {/* Łącznie powinno wyjść */}
      <div className="mt-3 rounded-2xl border border-amber-brand/40 bg-amber-brand/10 p-3">
        <div className="mb-1 flex items-center gap-1.5">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-brand">
            Podatki i składka — ile powinno wyjść
          </p>
          <InfoHint term="lacznie" />
        </div>
        <Wiersz label="VAT do zapłaty" value={vatDoZaplatyDodatni} klasa="text-ink" term="vat_do_zaplaty" />
        <Wiersz label="PIT do zapłaty za ten miesiąc" value={p.pitMiesiac} klasa="text-ink" term="pit_miesiac" />
        <Wiersz label="Składka zdrowotna" value={p.zdrowotna} klasa="text-ink" term="zdrowotna" />
        <Wiersz label="ŁĄCZNIE POWINNO WYJŚĆ" value={laczniePowinnoWyjsc} klasa="text-amber-brand" bold />
        {vatDoZaplatyDodatni === 0 && p.pitMiesiac === 0 && (
          <p className="mt-2 text-[11px] text-dim">
            W tym miesiącu nie wychodzi VAT ani PIT do zapłaty. Zostaje składka zdrowotna: {formatZl(p.zdrowotna)}.
          </p>
        )}
        {nadwyzka && (
          <p className="mt-2 text-[11px] text-green-300">
            VAT do wykorzystania w kolejnym okresie: {formatZl(nadwyzkaVat)}.
          </p>
        )}
      </div>

      <Wiersz
        label="Na czysto po PIT i zdrowotnej"
        value={p.zyskPoPodatkach}
        klasa={p.zyskPoPodatkach >= 0 ? "text-green-300" : "text-red-300"}
        bold
        term="wynik_po_podatkach"
      />

      {/* ── PRZEŁĄCZNIK SZCZEGÓŁÓW ───────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setSzczegoly((v) => !v)}
        className="mt-3 w-full rounded-xl border border-line py-2 text-xs font-bold text-dim hover:text-ink"
      >
        {szczegoly ? "Ukryj szczegóły podatkowe ▲" : "Pokaż szczegóły podatkowe ▼"}
      </button>

      {!szczegoly ? null : (
        <div className="mt-3 space-y-0.5">
          {/* Koszty */}
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-amber-brand">Koszty miesiąca (brutto)</p>
          <Wiersz
            label="Wynagrodzenie kierowcy"
            value={wynik.wynagrodzeniePracownika}
            note={oficjalneAktywne ? "realna wypłata (do podatku tylko część oficjalna)" : undefined}
          />
          {wynik.zusPracodawcy > 0 && (
            <Wiersz label="ZUS pracodawcy" value={wynik.zusPracodawcy} note="składki społeczne po stronie firmy" />
          )}
          <Wiersz label="Paliwo" value={wynik.paliwo} />
          <Wiersz label="Inne koszty" value={wynik.inne} />
          <Wiersz label="Leasing" value={wynik.leasing} />
          <Wiersz label="Razem koszty operacyjne" value={kosztyOperacyjne} bold />

          {/* VAT */}
          <p className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-amber-brand">VAT</p>
          <Wiersz label="VAT należny (sprzedaż)" value={p.vatNalezny} term="vat_nalezny" />
          <Wiersz label="Netto kosztów z faktur" value={p.kosztyNetto} />
          <Wiersz label="VAT naliczony (do odliczenia)" value={p.vatNaliczony} klasa="text-green-300" term="vat_naliczony" />
          {nadwyzka ? (
            <Wiersz label="Nadwyżka VAT na kolejny miesiąc" value={nadwyzkaVat} klasa="text-green-300" bold term="nadwyzka_vat" />
          ) : (
            <Wiersz label="VAT do zapłaty" value={p.vatDoZaplaty} klasa="text-red-300" bold term="vat_do_zaplaty" />
          )}

          {/* Koszty pracownika */}
          {oficjalneAktywne && (
            <>
              <p className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-amber-brand">Koszty pracownika</p>
              <Wiersz label="Oficjalny brutto (umowa)" value={oficjalnyBrutto} />
              {p.zusPracodawcy > 0 && <Wiersz label="ZUS pracodawcy" value={p.zusPracodawcy} />}
              <Wiersz label="Razem oficjalne (do podatku)" value={p.wynagrodzeniePodatkowe} klasa="text-green-300" bold />
              <Wiersz
                label="Pozostała wypłata niewliczana do kosztów podatkowych"
                value={nieoficjalne}
                klasa="text-red-300"
                note="zmniejsza gotówkę firmy, ale nie zmniejsza podstawy PIT"
              />
            </>
          )}

          {/* Podatek dochodowy */}
          <p className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-amber-brand">
            Podatek dochodowy ({taxForm === "skala" ? "skala" : "liniowy 19%"})
          </p>
          <Wiersz label="Przychód netto" value={p.przychodNetto} />
          <Wiersz label="Koszty uznane do PIT" value={p.kosztyPodatkowe} term="koszty_pit" />
          {strata ? (
            <Wiersz label="Koszty przewyższają przychód o" value={-p.dochod} klasa="text-ink" bold term="koszty_ponad_przychod" />
          ) : (
            <Wiersz label="Dochód do PIT" value={p.dochod} bold term="dochod_pit" />
          )}
          <Wiersz label="Łączny wynik podatkowy od początku roku" value={p.dochodYtd} term="wynik_ytd" />
          <Wiersz label="PIT wyliczony od początku roku" value={p.pitYtd} term="pit_ytd" />
          <Wiersz label="PIT do zapłaty za ten miesiąc" value={p.pitMiesiac} klasa="text-red-300" bold term="pit_miesiac" />

          {/* Zdrowotna */}
          <p className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-amber-brand">Zdrowotna</p>
          <Wiersz
            label="Składka za miesiąc"
            value={p.zdrowotna}
            klasa="text-red-300"
            term="zdrowotna"
            note={taxForm === "skala" ? "domyślnie 9% dochodu, z minimum z ustawień" : "domyślnie 4,9% dochodu, z minimum z ustawień"}
          />

          {/* Ile zostaje */}
          <p className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-amber-brand">Ile zostaje</p>
          <Wiersz label="Zysk operacyjny przed podatkami" value={p.zyskPrzedPodatkami} />
          <Wiersz
            label="Na czysto po dochodowym i zdrowotnej"
            value={p.zyskPoPodatkach}
            klasa={p.zyskPoPodatkach >= 0 ? "text-green-300" : "text-red-300"}
            bold
            term="wynik_po_podatkach"
          />
          <Wiersz
            label="Gotówka po podatkach i VAT"
            value={p.cashflowPoPodatkach}
            klasa={p.cashflowPoPodatkach >= 0 ? "text-green-300" : "text-red-300"}
            note="odejmuje też VAT do zapłaty; nadwyżka VAT nie jest doliczana jako gotówka"
          />
        </div>
      )}
    </Card>
  );
}
