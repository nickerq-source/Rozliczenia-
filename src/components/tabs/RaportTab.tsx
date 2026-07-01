"use client";

// Zakładka Raport — agregacja roczna: podsumowanie, ranking faktur, wykres

import { useMemo, useState, ReactNode } from "react";
import { WorkspaceData, MiesiącId, PDFImportData } from "@/lib/types";
import {
  obliczWynikMiesiaca,
  domyslneDaneMiesiaca,
  formatZl,
} from "@/lib/business-logic";
import {
  getWeeksOfMonth,
  formatRangeLabel,
  POLSKIE_MIESIACE,
  MIESIACE_ZAKRESU,
} from "@/lib/dates";
import { Card } from "../ui/Card";
import {
  IconChartBar,
  IconTrophy,
  IconRoad,
  IconCalendar,
  IconPackage,
  IconMoneybag,
  IconAlertTriangle,
} from "../ui/icons";
import { podatkiRoku, kosztyWgKategorii, getUstawienia } from "@/lib/tax";
import { cn } from "@/lib/utils";
import { Rozliczenie5050Panel } from "../Rozliczenie5050Panel";

interface Props {
  data: WorkspaceData;
}

interface RankRow {
  label: string;
  monthName: string;
  weekNumber: number;
  kwota: number;
  pdf?: PDFImportData;
}

function Row({
  label,
  value,
  note,
  valueClass,
}: {
  label: string;
  value: number;
  note?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-line last:border-0">
      <span className="text-sm text-ink flex-1">
        {label}
        {note && <span className="text-xs text-dim ml-1.5">{note}</span>}
      </span>
      <span className={cn("tabular-nums text-sm font-semibold", valueClass ?? "text-ink")}>{formatZl(value)}</span>
    </div>
  );
}

function StatPill({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-surface border border-line text-xs">
      <span className="text-amber-brand">{icon}</span>
      <span className="text-dim">{label}</span>
      <span className="font-bold text-white tabular-nums">{value}</span>
    </span>
  );
}

export function RaportTab({ data }: Props) {
  const [najlepszePierwsze, setNajlepszePierwsze] = useState(true);

  // Podatki narastająco + koszty wg kategorii (cały rok)
  const podatki = useMemo(() => podatkiRoku(data), [data]);
  const kategorie = useMemo(() => kosztyWgKategorii(data), [data]);
  const ustawienia = useMemo(() => getUstawienia(data), [data]);
  const podatkiSuma = useMemo(() => {
    const aktywne = podatki.filter(
      (p) => p.sprzedazNetto > 0 || p.kosztyPodatkowe > 0
    );
    return {
      sprzedazNetto: aktywne.reduce((s, p) => s + p.sprzedazNetto, 0),
      vatNalezny: aktywne.reduce((s, p) => s + p.vatNalezny, 0),
      kosztyNetto: aktywne.reduce((s, p) => s + p.kosztyNetto, 0),
      vatNaliczony: aktywne.reduce((s, p) => s + p.vatNaliczony, 0),
      vatDoZaplaty: aktywne.reduce((s, p) => s + p.vatDoZaplaty, 0),
      kosztyPodatkowe: aktywne.reduce((s, p) => s + p.kosztyPodatkowe, 0),
      pit: aktywne.reduce((s, p) => s + p.pitMiesiac, 0),
      zdrowotna: aktywne.reduce((s, p) => s + p.zdrowotna, 0),
      zyskPo: aktywne.reduce((s, p) => s + p.zyskPoPodatkach, 0),
      cashflow: aktywne.reduce((s, p) => s + p.cashflowPoPodatkach, 0),
      dochodYtd: podatki[podatki.length - 1]?.dochodYtd ?? 0,
      pitYtd: podatki[podatki.length - 1]?.pitYtd ?? 0,
      aktywneMiesiace: aktywne,
    };
  }, [podatki]);

  const raport = useMemo(() => {
    const u = getUstawienia(data);
    let przychod = 0, wynagrodzenie = 0, paliwo = 0, inne = 0, leasing = 0, zusPrac = 0;
    let oficjalnyBrutto = 0, nieoficjalne = 0;
    let aktywne = 0, kmTotal = 0, kolkaTotal = 0;
    const miesieczne: {
      m: MiesiącId;
      przychod: number;
      koszty: number;
      paliwo: number;
      wynagrodzenie: number;
      zysk: number;
    }[] = [];
    const ranking: RankRow[] = [];

    for (const m of MIESIACE_ZAKRESU) {
      const dane = data.miesiace[m] ?? domyslneDaneMiesiaca(m);
      const wynik = obliczWynikMiesiaca(m, dane, u);

      const aktywny =
        wynik.przychod > 0 ||
        wynik.wynagrodzeniePracownika > 0 ||
        wynik.paliwo > 0 ||
        wynik.inne > 0;

      if (aktywny) {
        aktywne++;
        przychod += wynik.przychod;
        wynagrodzenie += wynik.wynagrodzeniePracownika;
        zusPrac += wynik.zusPracodawcy;
        // Rozbicie pensji na oficjalną (do podatku) i nieoficjalną (gotówka)
        if (u.pracownikOficjalnyEnabled && wynik.wynagrodzeniePracownika > 0) {
          const brutto = Math.min(u.pracownikBruttoMies, wynik.wynagrodzeniePracownika);
          oficjalnyBrutto += brutto;
          nieoficjalne += wynik.wynagrodzeniePracownika - brutto;
        }
        paliwo += wynik.paliwo;
        inne += wynik.inne;
        leasing += wynik.leasing;
      }

      miesieczne.push({
        m,
        przychod: wynik.przychod,
        koszty: wynik.wynagrodzeniePracownika + wynik.zusPracodawcy + wynik.paliwo + wynik.inne + wynik.leasing,
        paliwo: wynik.paliwo,
        wynagrodzenie: wynik.wynagrodzeniePracownika,
        zysk: wynik.zysk,
      });

      // Ranking tygodni + suma km/kółek z importów PDF
      const weeks = getWeeksOfMonth(m);
      weeks.forEach((w, i) => {
        const saved = dane.faktury[i];
        if (!saved) return;
        const imp = saved.pdfImport;
        if (imp) {
          kmTotal += imp.sumaKm;
          kolkaTotal += imp.ileKolek;
        }
        if ((saved.kwota ?? 0) > 0) {
          ranking.push({
            label: saved.customRange
              ? formatRangeLabel(saved.customRange.od, saved.customRange.do)
              : w.label,
            monthName: POLSKIE_MIESIACE[m],
            weekNumber: i + 1,
            kwota: saved.kwota,
            pdf: imp,
          });
        }
      });
    }

    // Rangi liczone zawsze od najlepszej (1 = najwyższa kwota)
    const sortedDesc = [...ranking].sort((a, b) => b.kwota - a.kwota);
    const zysk = przychod - wynagrodzenie - zusPrac - paliwo - inne - leasing;

    return {
      przychod, wynagrodzenie, zusPrac, oficjalnyBrutto, nieoficjalne,
      oficjalneOn: u.pracownikOficjalnyEnabled,
      paliwo, inne, leasing, zysk,
      aktywne, kmTotal, kolkaTotal, miesieczne, sortedDesc,
    };
  }, [data]);

  const zyskDodatni = raport.zysk >= 0;
  const wyswietlane = najlepszePierwsze
    ? raport.sortedDesc
    : [...raport.sortedDesc].reverse();

  const maxSlupek = Math.max(
    1,
    ...raport.miesieczne.map((x) => Math.max(x.przychod, x.koszty))
  );
  const aktywneMiesieczne = raport.miesieczne.filter((x) => x.przychod > 0 || x.koszty > 0);
  const najlepszyMiesiac = aktywneMiesieczne.reduce<typeof aktywneMiesieczne[number] | null>(
    (best, x) => (!best || x.zysk > best.zysk ? x : best),
    null
  );
  const najgorszyMiesiac = aktywneMiesieczne.reduce<typeof aktywneMiesieczne[number] | null>(
    (worst, x) => (!worst || x.zysk < worst.zysk ? x : worst),
    null
  );
  const sredniZysk = aktywneMiesieczne.length
    ? aktywneMiesieczne.reduce((s, x) => s + x.zysk, 0) / aktywneMiesieczne.length
    : 0;
  const przychodPorownanie = aktywneMiesieczne.reduce((s, x) => s + x.przychod, 0);
  const paliwoProc = przychodPorownanie > 0
    ? (aktywneMiesieczne.reduce((s, x) => s + x.paliwo, 0) / przychodPorownanie) * 100
    : 0;
  const wynagrodzenieProc = przychodPorownanie > 0
    ? (aktywneMiesieczne.reduce((s, x) => s + x.wynagrodzenie, 0) / przychodPorownanie) * 100
    : 0;

  const medal = (rank: number) =>
    rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;

  return (
    <div className="space-y-4">
      {/* ── SEKCJA 1: PODSUMOWANIE ROCZNE ───────────────────────────────── */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <IconChartBar size={20} className="text-amber-brand" />
          <h2 className="text-lg font-bold text-white">Rok 2026 — Podsumowanie</h2>
        </div>

        <Row label="Przychód łączny (faktury)" value={raport.przychod} />
        <Row label="Koszty – wynagrodzenie" value={raport.wynagrodzenie} />
        <Row label="Koszty – paliwo" value={raport.paliwo} />
        <Row label="Koszty – inne" value={raport.inne} />
        <Row
          label="Koszty – leasing"
          value={raport.leasing}
          note={raport.aktywne > 0 ? `(${raport.aktywne} mies.)` : undefined}
        />

        <div
          className="flex items-center gap-3 rounded-2xl px-4 py-4 mt-4"
          style={{ background: zyskDodatni ? "var(--green-bg)" : "var(--red-bg)" }}
        >
          <span className={zyskDodatni ? "text-green-400" : "text-red-400"}>
            <IconMoneybag size={24} />
          </span>
          <span className="text-sm font-bold text-white uppercase tracking-wide flex-1">
            Zysk na czysto (rok)
          </span>
          <span
            className={cn(
              "tabular-nums text-2xl font-extrabold leading-none",
              zyskDodatni ? "text-green-300" : "text-red-300"
            )}
          >
            {formatZl(raport.zysk)}
          </span>
        </div>
      </Card>

      {/* Pill-statystyki */}
      <div className="flex flex-wrap gap-2">
        <StatPill
          icon={<IconCalendar size={14} />}
          label="Aktywnych miesięcy:"
          value={String(raport.aktywne)}
        />
        <StatPill
          icon={<IconRoad size={14} />}
          label="Łącznie km:"
          value={raport.kmTotal.toLocaleString("pl-PL")}
        />
        <StatPill
          icon={<IconPackage size={14} />}
          label="Łącznie kółek:"
          value={String(raport.kolkaTotal)}
        />
      </div>

      {aktywneMiesieczne.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <IconChartBar size={18} className="text-amber-brand" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-dim">
              Porównanie miesięcy
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-surface2 border border-line p-3">
              <p className="text-[11px] text-dim">Najlepszy miesiąc</p>
              <p className="text-sm font-bold text-white">{najlepszyMiesiac ? POLSKIE_MIESIACE[najlepszyMiesiac.m] : "—"}</p>
              <p className="tabular-nums text-green-300">{formatZl(najlepszyMiesiac?.zysk ?? 0)}</p>
            </div>
            <div className="rounded-xl bg-surface2 border border-line p-3">
              <p className="text-[11px] text-dim">Najsłabszy miesiąc</p>
              <p className="text-sm font-bold text-white">{najgorszyMiesiac ? POLSKIE_MIESIACE[najgorszyMiesiac.m] : "—"}</p>
              <p className="tabular-nums text-red-300">{formatZl(najgorszyMiesiac?.zysk ?? 0)}</p>
            </div>
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-dim">Średni zysk</span>
              <span className="tabular-nums text-ink">{formatZl(sredniZysk)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dim">Paliwo jako % przychodu</span>
              <span className="tabular-nums text-amber-brand">{paliwoProc.toFixed(1).replace(".", ",")}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dim">Wynagrodzenie jako % przychodu</span>
              <span className="tabular-nums text-amber-brand">{wynagrodzenieProc.toFixed(1).replace(".", ",")}%</span>
            </div>
          </div>
        </Card>
      )}

      {/* ── SEKCJA: PODATKI — SZACUNEK ───────────────────────────────────── */}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <IconMoneybag size={18} className="text-amber-brand" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-dim">
            Podatki — szacunek (rok)
          </h3>
        </div>
        <p className="text-[11px] text-dim/60 mb-3">
          Forma opodatkowania: <b className="text-ink">{ustawienia.taxForm === "skala" ? "skala (12/32%)" : "liniowy (19%)"}</b>.
          Szacunek pomocniczy — ostateczne rozliczenie potwierdza księgowa.
        </p>

        <p className="text-xs font-bold uppercase tracking-wider text-amber-brand mb-1">VAT</p>
        <Row label="Sprzedaż netto" value={podatkiSuma.sprzedazNetto} />
        <Row label="VAT należny" value={podatkiSuma.vatNalezny} />
        <Row label="Koszty netto" value={podatkiSuma.kosztyNetto} />
        <Row label="VAT naliczony (do odliczenia)" value={podatkiSuma.vatNaliczony} />
        <Row
          label={podatkiSuma.vatDoZaplaty >= 0 ? "VAT do zapłaty" : "Nadwyżka VAT"}
          value={Math.abs(podatkiSuma.vatDoZaplaty)}
        />

        {raport.oficjalneOn && (
          <>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-brand mb-1 mt-4">Koszty pracownika</p>
            <Row label="Oficjalne — brutto wg umowy" value={raport.oficjalnyBrutto} />
            {raport.zusPrac > 0 && <Row label="Oficjalne — ZUS pracodawcy" value={raport.zusPrac} />}
            <Row label="Razem oficjalne (do podatku)" value={raport.oficjalnyBrutto + raport.zusPrac} valueClass="text-green-300" />
            <Row label="Nieoficjalne (poza podatkiem)" value={raport.nieoficjalne} valueClass="text-red-300" />
          </>
        )}

        <p className="text-xs font-bold uppercase tracking-wider text-amber-brand mb-1 mt-4">Podatek dochodowy</p>
        <Row label="Przychód netto" value={podatkiSuma.sprzedazNetto} />
        <Row label="Koszty podatkowe" value={podatkiSuma.kosztyPodatkowe} />
        <Row
          label={podatkiSuma.dochodYtd >= 0 ? "Dochód narastająco" : "Strata narastająco"}
          value={Math.abs(podatkiSuma.dochodYtd)}
        />
        <Row label="Podatek narastająco" value={podatkiSuma.pitYtd} />
        <Row label="Suma zaliczek podatku" value={podatkiSuma.pit} />

        <p className="text-xs font-bold uppercase tracking-wider text-amber-brand mb-1 mt-4">Zdrowotna</p>
        <Row label="Suma składek" value={podatkiSuma.zdrowotna} />

        <p className="text-xs font-bold uppercase tracking-wider text-amber-brand mb-1 mt-4">Zysk</p>
        <Row label="Przed podatkami" value={raport.zysk} />
        <Row label="Po dochodowym i zdrowotnej" value={podatkiSuma.zyskPo} />
        <Row label="Cashflow po podatkach" value={podatkiSuma.cashflow} />

        {/* Tabela miesięczna */}
        {podatkiSuma.aktywneMiesiace.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[11px] tabular-nums">
              <thead>
                <tr className="text-dim text-left border-b border-line">
                  <th className="py-1 pr-2 font-medium">Mies.</th>
                  <th className="py-1 pr-2 font-medium text-right">Dochód</th>
                  <th className="py-1 pr-2 font-medium text-right">VAT</th>
                  <th className="py-1 pr-2 font-medium text-right">Doch.</th>
                  <th className="py-1 font-medium text-right">Zdrow.</th>
                </tr>
              </thead>
              <tbody>
                {podatkiSuma.aktywneMiesiace.map((p) => (
                  <tr key={p.miesiac} className="border-b border-line/50 last:border-0">
                    <td className="py-1 pr-2 text-dim">{POLSKIE_MIESIACE[p.miesiac].slice(0, 3)}</td>
                    <td className={cn("py-1 pr-2 text-right", p.dochod < 0 ? "text-red-300" : "text-ink")}>
                      {formatZl(p.dochod)}
                    </td>
                    <td className={cn("py-1 pr-2 text-right", p.vatDoZaplaty < 0 ? "text-green-300" : "text-ink")}>
                      {formatZl(p.vatDoZaplaty)}
                    </td>
                    <td className="py-1 pr-2 text-right text-ink">{formatZl(p.pitMiesiac)}</td>
                    <td className="py-1 text-right text-ink">{formatZl(p.zdrowotna)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── SEKCJA: KOSZTY WEDŁUG KATEGORII ──────────────────────────────── */}
      {kategorie.kategorie.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <IconPackage size={18} className="text-amber-brand" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-dim">
              Koszty według kategorii
            </h3>
          </div>
          <div className="space-y-1">
            {kategorie.kategorie.map((k, i) => {
              const max = kategorie.kategorie[0]?.suma || 1;
              return (
                <div key={k.kategoria} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-xs text-ink truncate">
                    {i === 0 && "🏆 "}
                    {k.label}
                    {(k.kategoria === "inne" || k.kategoria === "art_spozywcze") && (
                      <IconAlertTriangle size={10} className="inline ml-1 text-amber-brand" />
                    )}
                  </span>
                  <div className="flex-1 h-4 bg-surface2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-brand/70 rounded-full"
                      style={{ width: `${(k.suma / max) * 100}%`, minWidth: 4 }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs text-ink tabular-nums">
                    {formatZl(k.suma)}
                  </span>
                  <span className="w-8 shrink-0 text-right text-[10px] text-dim tabular-nums">
                    ×{k.liczba}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-dim/60 mt-3">
            Skategoryzowano przez: reguły {kategorie.zrodla.rule} · AI {kategorie.zrodla.ai} · ręcznie {kategorie.zrodla.manual}
          </p>
        </Card>
      )}

      {/* ── SEKCJA 2: RANKING FAKTUR ────────────────────────────────────── */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <IconTrophy size={18} className="text-amber-brand" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-dim flex-1">
            Ranking tygodni wg przychodu
          </h3>
          {raport.sortedDesc.length > 1 && (
            <button
              onClick={() => setNajlepszePierwsze((v) => !v)}
              className="shrink-0 px-2.5 py-1 rounded-lg border border-line text-xs text-dim hover:text-ink hover:border-dim transition-all duration-150"
            >
              {najlepszePierwsze ? "Najlepsze ↑" : "Najgorsze ↑"}
            </button>
          )}
        </div>

        {raport.sortedDesc.length === 0 ? (
          <p className="py-4 text-center text-sm text-dim/60">
            Brak faktur — dodaj pierwszą w zakładce Zarobek
          </p>
        ) : (
          <div className="space-y-1">
            {wyswietlane.map((row) => {
              const rank = raport.sortedDesc.indexOf(row) + 1;
              const ostatni =
                raport.sortedDesc.length > 1 && rank === raport.sortedDesc.length;
              return (
                <div
                  key={`${row.monthName}-${row.weekNumber}`}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                  style={ostatni ? { background: "#3a1212" } : undefined}
                >
                  <span className="shrink-0 w-8 text-center">
                    {medal(rank) ?? (
                      <span className="text-xs text-dim tabular-nums">#{rank}</span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">{row.label}</p>
                    <p className="text-[11px] text-dim">
                      {row.monthName}, tydzień {row.weekNumber}
                      {row.pdf && (
                        <span className="text-dim/60">
                          {" "}· {row.pdf.ileKolek} kółek · {row.pdf.sumaKm} km
                          {(row.pdf.manualAdditionsBrutto ?? 0) > 0 && (
                            <> · dodatki {formatZl(row.pdf.manualAdditionsBrutto ?? 0)}</>
                          )}
                        </span>
                      )}
                    </p>
                    {row.pdf?.komentarz && (
                      <p className="mt-0.5 text-[10px] text-amber-brand/80 line-clamp-2">
                        Komentarz: {row.pdf.komentarz}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 tabular-nums text-sm font-bold text-amber-brand">
                    {formatZl(row.kwota)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── SEKCJA 3: WYKRES MIESIĘCZNY ─────────────────────────────────── */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <IconChartBar size={18} className="text-amber-brand" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-dim flex-1">
            Przychód vs koszty
          </h3>
          <span className="flex items-center gap-2 text-[10px] text-dim">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-brand" /> przychód
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-400/80" /> koszty
            </span>
          </span>
        </div>

        <div className="flex items-end justify-between gap-1 h-32">
          {raport.miesieczne.map(({ m, przychod, koszty }) => (
            <div key={m} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="flex items-end gap-0.5 h-24 w-full justify-center">
                <div className="flex flex-col items-center justify-end h-full w-[40%] max-w-4">
                  {przychod > 0 && (
                    <span className="text-[8px] text-amber-brand tabular-nums leading-none mb-0.5">
                      {Math.round(przychod / 1000)}k
                    </span>
                  )}
                  <div
                    className="w-full rounded-t-sm bg-amber-brand"
                    style={{ height: `${(przychod / maxSlupek) * 100}%`, minHeight: przychod > 0 ? 2 : 0 }}
                  />
                </div>
                <div className="flex flex-col items-center justify-end h-full w-[40%] max-w-4">
                  {koszty > 0 && (
                    <span className="text-[8px] text-red-300 tabular-nums leading-none mb-0.5">
                      {Math.round(koszty / 1000)}k
                    </span>
                  )}
                  <div
                    className="w-full rounded-t-sm bg-red-400/80"
                    style={{ height: `${(koszty / maxSlupek) * 100}%`, minHeight: koszty > 0 ? 2 : 0 }}
                  />
                </div>
              </div>
              <span className="text-[10px] text-dim">{POLSKIE_MIESIACE[m].slice(0, 3)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Rozliczenie5050Panel
        ustawienia={ustawienia}
        wszystkieMiesiace={data.miesiace}
        domyslnyZakres="okres"
        tytul="Rozliczenie 50/50 (Artur / Damian)"
      />
    </div>
  );
}
