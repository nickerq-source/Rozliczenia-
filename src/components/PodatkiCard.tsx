"use client";

// Karta „Na czysto" — podatki i koszty aktywnego miesiąca.
// Widok prosty (domyślny) odpowiada po ludzku: ile do zapłaty i ile zostaje.
// Szczegóły podatkowe pokazują pełne rozbicie VAT, podatku dochodowego i zdrowotnej.

import { useState } from "react";
import { PodatkiMiesiaca } from "@/lib/tax";
import { formatZl } from "@/lib/business-logic";
import { MiesiącId, WynikMiesiaca } from "@/lib/types";
import { Card } from "./ui/Card";
import { IconMoneybag } from "./ui/icons";
import { cn } from "@/lib/utils";
import {
  InfoHint,
  JakCzytacPodatki,
  TaxExampleData,
  TaxExamplesProvider,
} from "./InfoHint";
import { TaxTermId } from "@/lib/taxGlossary";
import {
  WyjasnieniePodatkuMiesiaca,
  wyjasnijPodatekMiesiaca,
} from "@/lib/income-tax-explanation";
import { POLSKIE_MIESIACE } from "@/lib/dates";

const MIESIACE_DOPELNIACZ: Record<MiesiącId, string> = {
  6: "czerwca",
  7: "lipca",
  8: "sierpnia",
  9: "września",
  10: "października",
  11: "listopada",
  12: "grudnia",
};

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
    <div className={cn("flex items-start justify-between gap-3 text-sm py-1", bold && "font-bold pt-1.5 border-t border-line")}>
      <span className={cn("flex min-w-0 items-center gap-1.5 pr-1", bold ? "text-white" : "text-dim")}>
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

function WierszWyjasnienia({
  label,
  value,
  strong = false,
  valueClass,
}: {
  label: string;
  value: number;
  strong?: boolean;
  valueClass?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 py-1 text-xs", strong && "border-t border-current/15 pt-2 font-bold")}>
      <span className={strong ? "text-white" : "text-dim"}>{label}</span>
      <span className={cn("shrink-0 tabular-nums", valueClass ?? (strong ? "text-white" : "text-ink"))}>
        {formatZl(value)}
      </span>
    </div>
  );
}

function WyjasnienieZerowegoPodatku({
  wyjasnienie,
  miesiac,
}: {
  wyjasnienie: WyjasnieniePodatkuMiesiaca;
  miesiac: MiesiącId;
}) {
  if (wyjasnienie.podatekMiesiaca > 0) return null;

  if (wyjasnienie.powod === "strata") {
    return (
      <div className="mt-2 rounded-xl border border-amber-brand/45 bg-amber-brand/10 p-3">
        <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-amber-brand">
          Dlaczego podatek dochodowy = 0 zł?
        </p>
        {wyjasnienie.strataPrzedMiesiacem > 0 && (
          <WierszWyjasnienia
            label={
              miesiac > 6
                ? `Strata narastająco do końca ${MIESIACE_DOPELNIACZ[(miesiac - 1) as MiesiącId]}`
                : "Strata z poprzednich miesięcy"
            }
            value={wyjasnienie.strataPrzedMiesiacem}
          />
        )}
        {wyjasnienie.dochodMiesiaca > 0 && (
          <WierszWyjasnienia
            label="− Dochód podatkowy tego miesiąca"
            value={wyjasnienie.dochodMiesiaca}
          />
        )}
        {wyjasnienie.strataMiesiaca > 0 && (
          <WierszWyjasnienia
            label="+ Strata podatkowa tego miesiąca"
            value={wyjasnienie.strataMiesiaca}
          />
        )}
        {wyjasnienie.wykorzystanaStrata > 0 && (
          <WierszWyjasnienia
            label="Wykorzystano wcześniejszej straty"
            value={wyjasnienie.wykorzystanaStrata}
            valueClass="text-green-300"
          />
        )}
        <WierszWyjasnienia
          label="Pozostała strata podatkowa do rozliczenia"
          value={wyjasnienie.pozostalaStrata}
          valueClass={wyjasnienie.pozostalaStrata > 0 ? "text-red-300" : "text-green-300"}
          strong
        />
        <p className="mt-2 text-[11px] leading-relaxed text-amber-100/80">
          {wyjasnienie.pozostalaStrata > 0
            ? `Bieżący wynik najpierw rozlicza wcześniejszą stratę. Nadal pozostaje ${formatZl(wyjasnienie.pozostalaStrata)} straty, dlatego zaliczka na podatek dochodowy wynosi 0 zł.`
            : "Wcześniejsza strata została rozliczona, ale narastająco nie powstał jeszcze dodatni dochód do opodatkowania, dlatego zaliczka wynosi 0 zł."}
        </p>
        <p className="mt-1 text-[10px] font-semibold text-dim">
          {wyjasnienie.pozostalaStrata > 0
            ? "To nie jest nadpłata ani gotówka do zwrotu. To strata podatkowa pozostała do rozliczenia."
            : "To nie jest nadpłata ani gotówka do zwrotu."}
        </p>
      </div>
    );
  }

  if (wyjasnienie.powod === "kwota_wolna") {
    return (
      <div className="mt-2 rounded-xl border border-green-500/35 bg-green-soft/60 p-3">
        <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-green-300">
          Dlaczego podatek dochodowy = 0 zł?
        </p>
        {wyjasnienie.wykorzystanaStrata > 0 && (
          <WierszWyjasnienia
            label="Wykorzystano wcześniejszej straty"
            value={wyjasnienie.wykorzystanaStrata}
          />
        )}
        <WierszWyjasnienia
          label="Dochód podatkowy narastająco"
          value={wyjasnienie.dochodNarastajaco}
        />
        <WierszWyjasnienia label="Kwota wolna" value={wyjasnienie.kwotaWolna} />
        <WierszWyjasnienia
          label="Pozostało kwoty wolnej"
          value={wyjasnienie.pozostalaKwotaWolna}
          valueClass="text-green-300"
          strong
        />
        <p className="mt-2 text-[11px] leading-relaxed text-green-100/80">
          Dochód narastająco mieści się jeszcze w kwocie wolnej, dlatego zaliczka na podatek dochodowy wynosi 0 zł.
        </p>
      </div>
    );
  }

  if (wyjasnienie.powod === "wczesniejsze_zaliczki") {
    return (
      <div className="mt-2 rounded-xl border border-line bg-surface2 p-3">
        <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-ink">
          Dlaczego podatek dochodowy = 0 zł?
        </p>
        <WierszWyjasnienia
          label="Podatek wyliczony narastająco"
          value={wyjasnienie.podatekNarastajaco}
        />
        <WierszWyjasnienia
          label="Zaliczki naliczone wcześniej"
          value={wyjasnienie.zaliczkiPoprzednie}
        />
        <WierszWyjasnienia
          label="Do dopłaty w tym miesiącu"
          value={0}
          valueClass="text-green-300"
          strong
        />
        <p className="mt-2 text-[11px] leading-relaxed text-dim">
          Wcześniejsze zaliczki pokrywają podatek wyliczony narastająco, więc w tym miesiącu nie powstaje dopłata.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-line bg-surface2 p-3">
      <p className="text-[11px] leading-relaxed text-dim">
        Podatek dochodowy wynosi 0 zł, ponieważ narastająco nie ma dodatniego dochodu do opodatkowania.
      </p>
    </div>
  );
}

export function PodatkiCard({
  p,
  taxForm,
  taxFreeAmount = 30000,
  wynik,
}: {
  p: PodatkiMiesiaca;
  taxForm: "skala" | "liniowy";
  taxFreeAmount?: number;
  wynik: WynikMiesiaca;
}) {
  const [szczegoly, setSzczegoly] = useState(false);

  const nadwyzka = p.vatDoZaplaty < 0;
  const strata = p.dochod < 0;
  const vatDoZaplatyDodatni = Math.max(0, p.vatDoZaplaty);
  const nadwyzkaVat = Math.max(0, -p.vatDoZaplaty);
  const sprzedazBrutto = p.sprzedazNetto + p.vatNalezny;
  // Łączne zobowiązania: podatki właściciela i firmy oraz stałe obciążenia pracownika.
  const laczniePowinnoWyjsc = vatDoZaplatyDodatni + p.pitMiesiac + p.zdrowotna + p.obciazeniaPracownika;

  const kosztyOperacyjne =
    wynik.wynagrodzeniePracownika + wynik.obciazeniaPracownika + wynik.paliwo + wynik.inne + wynik.leasing;
  const kosztPracownika = wynik.wynagrodzeniePracownika + wynik.obciazeniaPracownika;
  const kosztyZakupowe = wynik.paliwo + wynik.inne + wynik.leasing;
  const kosztyZakupowePodatkowe = Math.max(0, p.kosztyPodatkowe - p.wynagrodzeniePodatkowe);
  const oficjalneAktywne = p.wynagrodzeniePodatkowe !== wynik.wynagrodzeniePracownika || p.obciazeniaPracownika > 0;
  const oficjalnyBrutto = Math.max(0, p.wynagrodzeniePodatkowe - p.obciazeniaPracownika);
  const nieoficjalne = Math.max(0, wynik.wynagrodzeniePracownika - oficjalnyBrutto);
  const wyjasnieniePodatku = wyjasnijPodatekMiesiaca(p, { taxForm, taxFreeAmount });
  const miesiacLabel = `${POLSKIE_MIESIACE[p.miesiac]} 2026`;
  const aktualneDaneLabel = `Twoje dane — ${miesiacLabel}`;
  const taxExamples: Partial<Record<TaxTermId, TaxExampleData>> = {
    vat_nalezny: {
      label: aktualneDaneLabel,
      text: `VAT należny ze sprzedaży w tym miesiącu: ${formatZl(p.vatNalezny)}.`,
    },
    vat_naliczony: {
      label: aktualneDaneLabel,
      text: `VAT z zakupów możliwy do odliczenia w tym miesiącu: ${formatZl(p.vatNaliczony)}.`,
    },
    vat_do_zaplaty: {
      label: aktualneDaneLabel,
      text: `${formatZl(p.vatNalezny)} VAT należnego − ${formatZl(p.vatNaliczony)} VAT do odliczenia = ${formatZl(vatDoZaplatyDodatni)} VAT do zapłaty.`,
    },
    nadwyzka_vat: {
      label: aktualneDaneLabel,
      text: `${formatZl(p.vatNaliczony)} VAT do odliczenia − ${formatZl(p.vatNalezny)} VAT należnego = ${formatZl(nadwyzkaVat)} nadwyżki VAT.`,
    },
    koszty_pit: {
      label: aktualneDaneLabel,
      text: `Paliwo brutto ${formatZl(wynik.paliwo)}, inne koszty brutto ${formatZl(wynik.inne)}, leasing brutto ${formatZl(wynik.leasing)}. Po rozliczeniu VAT podatkowa część zakupów wynosi ${formatZl(kosztyZakupowePodatkowe)}. Razem z kosztami pracownika ${formatZl(p.wynagrodzeniePodatkowe)} daje ${formatZl(p.kosztyPodatkowe)} kosztów uznanych do podatku dochodowego.`,
    },
    dochod_pit: {
      label: aktualneDaneLabel,
      text: `${formatZl(p.przychodNetto)} przychodu netto − ${formatZl(p.kosztyPodatkowe)} kosztów podatkowych = ${formatZl(Math.max(0, p.dochod))} dochodu podatkowego.`,
    },
    koszty_ponad_przychod: {
      label: aktualneDaneLabel,
      text: `${formatZl(p.kosztyPodatkowe)} kosztów podatkowych − ${formatZl(p.przychodNetto)} przychodu netto = ${formatZl(Math.max(0, -p.dochod))} straty podatkowej.`,
    },
    wynik_ytd: {
      label: aktualneDaneLabel,
      text: p.dochodYtd < 0
        ? `Od początku rozliczanego okresu pozostaje ${formatZl(-p.dochodYtd)} straty podatkowej.`
        : `Łączny dochód podatkowy od początku rozliczanego okresu wynosi ${formatZl(p.dochodYtd)}.`,
    },
    pit_ytd: {
      label: aktualneDaneLabel,
      text: `Podatek dochodowy wyliczony narastająco: ${formatZl(p.pitYtd)}.`,
    },
    pit_miesiac: {
      label: aktualneDaneLabel,
      text: `${formatZl(p.pitYtd)} podatku narastająco − ${formatZl(p.pitZaplaconyPrzed)} zaliczek naliczonych wcześniej = ${formatZl(p.pitMiesiac)} do zapłaty za ten miesiąc.`,
    },
    zdrowotna: {
      label: aktualneDaneLabel,
      text: `Dochód podatkowy miesiąca: ${formatZl(p.dochod)}. Składka zdrowotna właściciela: ${formatZl(p.zdrowotna)}.`,
    },
    lacznie: {
      label: aktualneDaneLabel,
      text: `${formatZl(vatDoZaplatyDodatni)} VAT + ${formatZl(p.pitMiesiac)} podatku dochodowego + ${formatZl(p.zdrowotna)} zdrowotnej właściciela + ${formatZl(p.obciazeniaPracownika)} zobowiązań pracownika = ${formatZl(laczniePowinnoWyjsc)}.`,
    },
    wynik_po_podatkach: {
      label: aktualneDaneLabel,
      text: `${formatZl(p.zyskPrzedPodatkami)} zysku przed podatkami − ${formatZl(p.pitMiesiac)} podatku dochodowego − ${formatZl(p.zdrowotna)} zdrowotnej = ${formatZl(p.zyskPoPodatkach)} przed rozliczeniem VAT.`,
    },
    wynik_na_czysto: {
      label: aktualneDaneLabel,
      text: `${formatZl(sprzedazBrutto)} przychodu brutto − ${formatZl(wynik.wynagrodzeniePracownika)} wypłaty kierowcy − ${formatZl(wynik.paliwo)} paliwa − ${formatZl(wynik.inne)} innych kosztów − ${formatZl(wynik.leasing)} leasingu − ${formatZl(laczniePowinnoWyjsc)} podatków i składek = ${formatZl(p.cashflowPoPodatkach)} realnie zostaje.`,
    },
  };
  const taxSummary: TaxExampleData = {
    label: `Podsumowanie Twoich danych — ${miesiacLabel}`,
    text: `Przychód netto ${formatZl(p.przychodNetto)}, koszty uznane podatkowo ${formatZl(p.kosztyPodatkowe)}, dochód podatkowy ${formatZl(p.dochod)}, VAT do zapłaty ${formatZl(vatDoZaplatyDodatni)}, podatek dochodowy za miesiąc ${formatZl(p.pitMiesiac)}, zdrowotna właściciela ${formatZl(p.zdrowotna)}.`,
  };

  return (
    <TaxExamplesProvider examples={taxExamples} summary={taxSummary}>
      <Card>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconMoneybag size={18} className="text-amber-brand" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-dim">Podsumowanie rozliczenia</h3>
        </div>
        <JakCzytacPodatki />
      </div>
      <p className="mb-3 text-[11px] text-dim/60">
        Wyliczenia są szacunkowe. Ostateczne rozliczenie potwierdza księgowa.
      </p>

      {/* ── WIDOK PROSTY ─────────────────────────────────────────────── */}
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-brand">
        Kolejność obliczeń
      </p>
      <div className="overflow-hidden rounded-2xl border border-line">
        <div className="border-b border-line bg-surface2/70 p-3">
          <p className="mb-1 text-xs font-bold text-white">1. Oddziel VAT od sprzedaży</p>
          <Wiersz label="Sprzedaż brutto" value={sprzedazBrutto} />
          <Wiersz label="− VAT zawarty w sprzedaży" value={p.vatNalezny} />
          <Wiersz label="= Przychód netto" value={p.przychodNetto} bold />
          <p className="mb-0.5 mt-2 text-[10px] font-bold uppercase tracking-wider text-dim">
            Osobne rozliczenie VAT
          </p>
          <Wiersz label="VAT należny ze sprzedaży" value={p.vatNalezny} />
          <Wiersz label="− VAT z zakupów do odliczenia" value={p.vatNaliczony} />
          <Wiersz
            label={nadwyzka ? "Nadwyżka VAT na kolejny okres" : "VAT do zapłaty"}
            value={nadwyzka ? nadwyzkaVat : vatDoZaplatyDodatni}
            klasa={nadwyzka ? "text-green-300" : "text-red-300"}
            bold
            term={nadwyzka ? "nadwyzka_vat" : "vat_do_zaplaty"}
          />
        </div>

        <div className="border-b border-line p-3">
          <p className="mb-1 text-xs font-bold text-white">2. Policz dochód podatkowy</p>
          <Wiersz label="Przychód netto" value={p.przychodNetto} />
          <Wiersz
            label="− Koszty pracownika uznane do podatku"
            value={p.wynagrodzeniePodatkowe}
          />
          <Wiersz
            label="− Koszty zakupowe uznane do podatku"
            value={kosztyZakupowePodatkowe}
          />
          <Wiersz
            label="= Razem koszty uznane do podatku dochodowego"
            value={p.kosztyPodatkowe}
            term="koszty_pit"
            bold
          />
          <p className="mt-1 text-[10px] leading-relaxed text-dim/70">
            Paliwo, inne koszty i leasing w podsumowaniu końcowym są pokazane brutto.
            Tutaj zakupy wchodzą jako netto i ewentualny nieodliczony VAT, dlatego kwoty są inne.
          </p>
          {strata ? (
            <Wiersz
              label="Strata podatkowa"
              value={-p.dochod}
              klasa="text-red-300"
              bold
              term="koszty_ponad_przychod"
              note="podatek dochodowy za ten miesiąc wynosi 0 zł"
            />
          ) : (
            <Wiersz label="Dochód podatkowy" value={p.dochod} bold term="dochod_pit" />
          )}
        </div>

        <div className="border-b border-line bg-surface2/35 p-3">
          <p className="mb-1 text-xs font-bold text-white">
            3. Policz podatek dochodowy i zdrowotną
          </p>
          <div className="flex items-center justify-between gap-3 py-1 text-sm">
            <span className="text-dim">Forma opodatkowania</span>
            <span className="text-right font-bold text-ink">
              {taxForm === "skala" ? "Skala 12% / 32%" : "Liniowy 19%"}
            </span>
          </div>
          <Wiersz
            label="Podatek dochodowy do zapłaty"
            value={p.pitMiesiac}
            klasa={p.pitMiesiac > 0 ? "text-red-300" : "text-green-300"}
            term="pit_miesiac"
          />
          <WyjasnienieZerowegoPodatku wyjasnienie={wyjasnieniePodatku} miesiac={p.miesiac} />
          <Wiersz
            label="Składka zdrowotna właściciela"
            value={p.zdrowotna}
            term="zdrowotna"
          />
          <p className="mt-2 text-[11px] leading-relaxed text-dim">
            {taxForm === "skala"
              ? "Na skali podatkowej podatek dochodowy i składka zdrowotna są liczone od dochodu. Składki zdrowotnej nie odejmuje się przed obliczeniem podatku dochodowego."
              : "Przy podatku liniowym podatek dochodowy i składka zdrowotna są liczone osobno według stawek zapisanych w ustawieniach."}{" "}
            VAT jest rozliczany osobno i nie jest podstawą podatku dochodowego.
          </p>
        </div>

        <div className="bg-green-soft/70 p-3">
          <p className="mb-1 text-xs font-bold text-green-300">4. Podsumowanie końcowe</p>
          <Wiersz label="Przychód brutto" value={sprzedazBrutto} />
          <Wiersz label="− Cała wypłata kierowcy" value={wynik.wynagrodzeniePracownika} />
          <Wiersz label="− Paliwo" value={wynik.paliwo} />
          <Wiersz label="− Inne koszty" value={wynik.inne} />
          <Wiersz label="− Leasing" value={wynik.leasing} />
          <Wiersz
            label="− Podatki i składki razem"
            value={laczniePowinnoWyjsc}
            note="VAT, podatek dochodowy, zdrowotna właściciela i zobowiązania pracownika"
            term="lacznie"
          />
          <Wiersz
            label="= REALNIE ZOSTAJE PO WSZYSTKICH KOSZTACH I PODATKACH"
            value={p.cashflowPoPodatkach}
            klasa={p.cashflowPoPodatkach >= 0 ? "text-green-300" : "text-red-300"}
            bold
            term="wynik_na_czysto"
          />
        </div>
      </div>

      {/* Podatki i składki do odprowadzenia */}
      <div className="mt-3 rounded-2xl border border-amber-brand/40 bg-amber-brand/10 p-3">
        <div className="mb-1 flex items-center gap-1.5">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-brand">
            Podatki i składki do odprowadzenia
          </p>
          <InfoHint term="lacznie" />
        </div>
        <Wiersz label="VAT do zapłaty" value={vatDoZaplatyDodatni} klasa="text-ink" term="vat_do_zaplaty" />
        <Wiersz label="Podatek dochodowy do zapłaty" value={p.pitMiesiac} klasa="text-ink" term="pit_miesiac" />
        <Wiersz label="Składka zdrowotna właściciela" value={p.zdrowotna} klasa="text-ink" term="zdrowotna" />
        {p.podatekDochodowyPracownika > 0 && <Wiersz label="Podatek dochodowy pracownika" value={p.podatekDochodowyPracownika} klasa="text-ink" />}
        {p.skladkaZdrowotnaPracownika > 0 && <Wiersz label="Składka zdrowotna pracownika" value={p.skladkaZdrowotnaPracownika} klasa="text-ink" />}
        {p.pozostaleSkladkiZusPracownika > 0 && <Wiersz label="Pozostałe składki ZUS pracownika" value={p.pozostaleSkladkiZusPracownika} klasa="text-ink" />}
        <Wiersz label="RAZEM PODATKI I SKŁADKI" value={laczniePowinnoWyjsc} klasa="text-amber-brand" bold />
        {vatDoZaplatyDodatni === 0 && p.pitMiesiac === 0 && p.obciazeniaPracownika === 0 && (
          <p className="mt-2 text-[11px] text-dim">
            W tym miesiącu nie wychodzi VAT ani podatek dochodowy do zapłaty. Zostaje składka zdrowotna właściciela: {formatZl(p.zdrowotna)}.
          </p>
        )}
        {nadwyzka && (
          <p className="mt-2 text-[11px] text-green-300">
            VAT do wykorzystania w kolejnym okresie: {formatZl(nadwyzkaVat)}.
          </p>
        )}
      </div>

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
          {/* Koszty pracownika — poza VAT */}
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-amber-brand">
            Koszty pracownika — bez VAT
          </p>
          <Wiersz
            label="Wynagrodzenie kierowcy"
            value={wynik.wynagrodzeniePracownika}
            note={oficjalneAktywne ? "kwota wypłacana kierowcy; do podatku tylko część oficjalna" : "kwota wypłacana kierowcy; bez VAT"}
          />
          {wynik.podatekDochodowyPracownika > 0 && <Wiersz label="Podatek dochodowy pracownika" value={wynik.podatekDochodowyPracownika} />}
          {wynik.skladkaZdrowotnaPracownika > 0 && <Wiersz label="Składka zdrowotna pracownika" value={wynik.skladkaZdrowotnaPracownika} />}
          {wynik.pozostaleSkladkiZusPracownika > 0 && <Wiersz label="Pozostałe składki ZUS pracownika" value={wynik.pozostaleSkladkiZusPracownika} />}
          <Wiersz label="Razem koszt pracownika" value={kosztPracownika} bold />

          {/* Koszty zakupowe — VAT tylko z dokumentów */}
          <p className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-amber-brand">
            Koszty zakupowe — VAT według dokumentów
          </p>
          <Wiersz label="Paliwo" value={wynik.paliwo} />
          <Wiersz label="Inne koszty" value={wynik.inne} />
          <Wiersz label="Leasing" value={wynik.leasing} />
          <Wiersz label="Razem koszty zakupowe (brutto)" value={kosztyZakupowe} bold />
          <Wiersz label="Razem koszty operacyjne" value={kosztyOperacyjne} bold />

          {/* VAT */}
          <p className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-amber-brand">VAT</p>
          <Wiersz label="VAT należny (sprzedaż)" value={p.vatNalezny} term="vat_nalezny" />
          <Wiersz label="Netto kosztów zakupowych z dokumentów" value={p.kosztyNetto} />
          <Wiersz label="VAT naliczony (do odliczenia)" value={p.vatNaliczony} klasa="text-green-300" term="vat_naliczony" />
          {nadwyzka ? (
            <Wiersz label="Nadwyżka VAT na kolejny miesiąc" value={nadwyzkaVat} klasa="text-green-300" bold term="nadwyzka_vat" />
          ) : (
            <Wiersz label="VAT do zapłaty" value={p.vatDoZaplaty} klasa="text-red-300" bold term="vat_do_zaplaty" />
          )}

          {/* Koszty pracownika */}
          {oficjalneAktywne && (
            <>
              <p className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-amber-brand">
                Wpływ kosztów pracownika na podatek dochodowy
              </p>
              <Wiersz label="Wynagrodzenie przyjęte do podatku (bez obciążeń)" value={oficjalnyBrutto} />
              {p.podatekDochodowyPracownika > 0 && <Wiersz label="Podatek dochodowy pracownika" value={p.podatekDochodowyPracownika} />}
              {p.skladkaZdrowotnaPracownika > 0 && <Wiersz label="Składka zdrowotna pracownika" value={p.skladkaZdrowotnaPracownika} />}
              {p.pozostaleSkladkiZusPracownika > 0 && <Wiersz label="Pozostałe składki ZUS pracownika" value={p.pozostaleSkladkiZusPracownika} />}
              <Wiersz label="Razem obciążenia pracownika" value={p.obciazeniaPracownika} bold />
              <Wiersz label="Razem oficjalne (do podatku)" value={p.wynagrodzeniePodatkowe} klasa="text-green-300" bold />
              <Wiersz
                label="Pozostała wypłata niewliczana do kosztów podatkowych"
                value={nieoficjalne}
                klasa="text-red-300"
                note="zmniejsza gotówkę firmy, ale nie zmniejsza podstawy podatku dochodowego"
              />
            </>
          )}

          {/* Podatek dochodowy */}
          <p className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-amber-brand">
            Podatek dochodowy ({taxForm === "skala" ? "skala" : "liniowy 19%"})
          </p>
          <Wiersz label="Przychód netto" value={p.przychodNetto} />
          <Wiersz label="Koszty pracownika uznane do dochodowego" value={p.wynagrodzeniePodatkowe} />
          <Wiersz label="Koszty zakupowe uznane do dochodowego" value={kosztyZakupowePodatkowe} />
          <Wiersz label="Razem koszty uznane do dochodowego" value={p.kosztyPodatkowe} term="koszty_pit" bold />
          {strata ? (
            <Wiersz label="Koszty przewyższają przychód o" value={-p.dochod} klasa="text-ink" bold term="koszty_ponad_przychod" />
          ) : (
            <Wiersz label="Dochód podatkowy" value={p.dochod} bold term="dochod_pit" />
          )}
          <Wiersz
            label={p.dochodYtd < 0 ? "Pozostała strata podatkowa do rozliczenia" : "Łączny wynik podatkowy od początku roku"}
            value={Math.abs(p.dochodYtd)}
            klasa={p.dochodYtd < 0 ? "text-red-300" : "text-ink"}
            term="wynik_ytd"
          />
          <Wiersz label="Podatek dochodowy wyliczony od początku roku" value={p.pitYtd} term="pit_ytd" />
          <Wiersz label="Podatek dochodowy do zapłaty za ten miesiąc" value={p.pitMiesiac} klasa="text-red-300" bold term="pit_miesiac" />

          {/* Zdrowotna */}
          <p className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-amber-brand">Zdrowotna właściciela</p>
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
            label="Po dochodowym i zdrowotnej — przed VAT"
            value={p.zyskPoPodatkach}
            klasa={p.zyskPoPodatkach >= 0 ? "text-ink" : "text-red-300"}
            note="kwota przed rozliczeniem VAT"
            term="wynik_po_podatkach"
          />
          <div className="mt-2 rounded-xl border border-green-500/35 bg-green-soft px-3 py-1.5">
            <Wiersz
              label="REALNIE ZOSTAJE PO WSZYSTKICH KOSZTACH I PODATKACH"
              value={p.cashflowPoPodatkach}
              klasa={p.cashflowPoPodatkach >= 0 ? "text-green-300" : "text-red-300"}
              note="po odjęciu wypłaty kierowcy, zakupów, VAT, podatku dochodowego i wszystkich składek"
              bold
              term="wynik_na_czysto"
            />
          </div>
        </div>
      )}
      </Card>
    </TaxExamplesProvider>
  );
}
