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
} from "../ui/icons";
import { cn } from "@/lib/utils";

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
}: {
  label: string;
  value: number;
  note?: string;
}) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-line last:border-0">
      <span className="text-sm text-ink flex-1">
        {label}
        {note && <span className="text-xs text-dim ml-1.5">{note}</span>}
      </span>
      <span className="tabular-nums text-sm font-semibold text-ink">{formatZl(value)}</span>
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

  const raport = useMemo(() => {
    let przychod = 0, wynagrodzenie = 0, paliwo = 0, inne = 0, leasing = 0;
    let aktywne = 0, kmTotal = 0, kolkaTotal = 0;
    const miesieczne: { m: MiesiącId; przychod: number; koszty: number }[] = [];
    const ranking: RankRow[] = [];

    for (const m of MIESIACE_ZAKRESU) {
      const dane = data.miesiace[m] ?? domyslneDaneMiesiaca(m);
      const wynik = obliczWynikMiesiaca(m, dane);

      const aktywny =
        wynik.przychod > 0 ||
        wynik.wynagrodzeniePracownika > 0 ||
        wynik.paliwo > 0 ||
        wynik.inne > 0;

      if (aktywny) {
        aktywne++;
        przychod += wynik.przychod;
        wynagrodzenie += wynik.wynagrodzeniePracownika;
        paliwo += wynik.paliwo;
        inne += wynik.inne;
        leasing += wynik.leasing;
      }

      miesieczne.push({
        m,
        przychod: wynik.przychod,
        koszty: wynik.wynagrodzeniePracownika + wynik.paliwo + wynik.inne + wynik.leasing,
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
    const zysk = przychod - wynagrodzenie - paliwo - inne - leasing;

    return {
      przychod, wynagrodzenie, paliwo, inne, leasing, zysk,
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
                        </span>
                      )}
                    </p>
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
    </div>
  );
}
