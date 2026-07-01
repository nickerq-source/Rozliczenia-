"use client";

// Rozliczenie 50/50 Artur / Damian — podsumowanie, saldo (kto komu oddaje),
// zakres narastająco (ten miesiąc / Cze–Gru / wszystko) i lista pozycji.
// Firma płaci „z firmy" i nie tworzy prywatnego długu.

import { useMemo, useState } from "react";
import { Card, CardTitle } from "./ui/Card";
import { IconUsers } from "./ui/icons";
import { cn } from "@/lib/utils";
import { formatZl } from "@/lib/business-logic";
import { kategoriaLabel } from "@/lib/tax";
import { POLSKIE_MIESIACE, MIESIACE_ZAKRESU } from "@/lib/dates";
import type { DaneMiesiaca, KosztPayer, MiesiącId, UstawieniaPodatkowe } from "@/lib/types";
import {
  Pozycja5050,
  Zrodlo5050,
  podsumujSaldo,
  tekstSalda,
  udzialDrugiej,
  zbierzPozycje,
  zbierzPozycjeMiesiaca,
} from "@/lib/rozliczenie-5050";

type Zakres = "miesiac" | "okres" | "wszystko";
type PayerFilter = "all" | KosztPayer;
type ZrodloFilter = "all" | Zrodlo5050;

const ZAKRESY: { id: Zakres; label: string }[] = [
  { id: "miesiac", label: "Ten miesiąc" },
  { id: "okres", label: "Cze–Gru 2026" },
  { id: "wszystko", label: "Wszystko" },
];

const PAYERS: { id: PayerFilter; label: string }[] = [
  { id: "all", label: "wszyscy" },
  { id: "Artur", label: "Artur" },
  { id: "Damian", label: "Damian" },
  { id: "Firma", label: "Firma" },
];

const ZRODLA: { id: ZrodloFilter; label: string }[] = [
  { id: "all", label: "wszystkie" },
  { id: "tankowanie", label: "Tankowanie" },
  { id: "koszt", label: "Koszt" },
  { id: "leasing", label: "Leasing" },
];

const ZRODLO_LABEL: Record<Zrodlo5050, string> = {
  tankowanie: "Tankowanie",
  koszt: "Koszt",
  leasing: "Leasing",
};

function ddmmrr(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "—";
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

export function Rozliczenie5050Panel({
  dane,
  miesiac,
  ustawienia,
  wszystkieMiesiace,
  domyslnyZakres = "miesiac",
  tytul = "Rozliczenie 50/50",
}: {
  dane?: DaneMiesiaca;
  miesiac?: MiesiącId;
  ustawienia: UstawieniaPodatkowe;
  wszystkieMiesiace?: Partial<Record<MiesiącId, DaneMiesiaca>>;
  domyslnyZakres?: Zakres;
  tytul?: string;
}) {
  const [zakres, setZakres] = useState<Zakres>(domyslnyZakres);
  const [payer, setPayer] = useState<PayerFilter>("all");
  const [zrodlo, setZrodlo] = useState<ZrodloFilter>("all");

  const maWszystkie = !!wszystkieMiesiace;

  const pozycje = useMemo<Pozycja5050[]>(() => {
    if (zakres === "miesiac" || !wszystkieMiesiace) {
      if (dane && miesiac) return zbierzPozycjeMiesiaca(dane, ustawienia, miesiac);
      if (wszystkieMiesiace) return zbierzPozycje(wszystkieMiesiace, ustawienia, [...MIESIACE_ZAKRESU]);
      return [];
    }
    const zakresM: MiesiącId[] =
      zakres === "okres"
        ? [...MIESIACE_ZAKRESU]
        : (Object.keys(wszystkieMiesiace)
            .map((k) => Number(k) as MiesiącId)
            .filter((n) => !Number.isNaN(n))
            .sort((a, b) => a - b) as MiesiącId[]);
    return zbierzPozycje(wszystkieMiesiace, ustawienia, zakresM);
  }, [zakres, wszystkieMiesiace, dane, miesiac, ustawienia]);

  const saldo = useMemo(() => podsumujSaldo(pozycje), [pozycje]);

  const lista = useMemo(
    () =>
      pozycje
        .filter((p) => (payer === "all" || p.paidBy === payer) && (zrodlo === "all" || p.zrodlo === zrodlo))
        .sort((a, b) => (a.data < b.data ? 1 : -1)),
    [pozycje, payer, zrodlo]
  );

  const podpisZakresu =
    zakres === "miesiac" && miesiac
      ? `${POLSKIE_MIESIACE[miesiac]} 2026`
      : zakres === "okres"
      ? "Czerwiec–Grudzień 2026"
      : "Cały okres";

  return (
    <Card>
      <div className="mb-3 flex items-start gap-2">
        <IconUsers size={18} className="mt-0.5 text-amber-brand" />
        <div className="min-w-0 flex-1">
          <CardTitle className="mb-1">{tytul}</CardTitle>
          <p className="text-[11px] text-dim">
            {podpisZakresu} · tylko koszty z włączonym 50/50 (Firma liczona osobno, bez długu).
          </p>
        </div>
      </div>

      {maWszystkie && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {ZAKRESY.map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={() => setZakres(z.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
                zakres === z.id
                  ? "border-amber-brand bg-amber-brand text-amber-ink"
                  : "border-line bg-surface2 text-dim hover:text-ink"
              )}
            >
              {z.label}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-amber-brand/35 bg-amber-brand/10 p-3">
        <div className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          <Wiersz label="Koszty 50/50 razem" value={formatZl(saldo.kosztyRazem)} />
          <Wiersz label="Zapłaciła Firma (osobno)" value={formatZl(saldo.firmaPaid)} />
          <Wiersz label="Zapłacił Artur" value={formatZl(saldo.arturPaid)} />
          <Wiersz label="Zapłacił Damian" value={formatZl(saldo.damianPaid)} />
          <Wiersz label="Udział Artura 50%" value={formatZl(saldo.udzialArtura)} />
          <Wiersz label="Udział Damiana 50%" value={formatZl(saldo.udzialDamiana)} />
        </div>
        <p
          className={cn(
            "mt-3 rounded-xl px-3 py-2 text-sm font-bold",
            saldo.kto === "rozliczone"
              ? "bg-surface/70 text-white"
              : "border border-green-500/25 bg-green-soft text-green-200"
          )}
        >
          {tekstSalda(saldo, formatZl)}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-[11px] font-semibold text-dim">
          Kto zapłacił
          <select
            value={payer}
            onChange={(e) => setPayer(e.target.value as PayerFilter)}
            className="mt-1 w-full min-h-[42px] rounded-lg border border-line bg-input px-2 py-2 text-sm text-ink"
          >
            {PAYERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-dim">
          Źródło
          <select
            value={zrodlo}
            onChange={(e) => setZrodlo(e.target.value as ZrodloFilter)}
            className="mt-1 w-full min-h-[42px] rounded-lg border border-line bg-input px-2 py-2 text-sm text-ink"
          >
            {ZRODLA.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Lista pozycji — telefon */}
      <div className="mt-3 space-y-2 sm:hidden">
        {lista.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface2/60 px-3 py-6 text-center text-sm text-dim">
            Brak pozycji 50/50 w tym zakresie.
          </p>
        ) : (
          lista.map((p) => {
            const u = udzialDrugiej(p);
            return (
              <div key={`${p.miesiac}-${p.id}`} className="rounded-xl border border-line bg-surface2/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">{p.nazwa}</p>
                    <p className="text-[11px] text-dim">
                      {ddmmrr(p.data)} · {kategoriaLabel(p.kategoria)} · {ZRODLO_LABEL[p.zrodlo]}
                    </p>
                  </div>
                  <span className="shrink-0 tabular-nums text-sm font-bold text-white">{formatZl(p.brutto)}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-full border border-line px-2 py-0.5 text-dim">{p.paidBy}</span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 font-bold",
                      u.kwota > 0
                        ? "border-green-500/35 text-green-200"
                        : "border-line text-dim"
                    )}
                  >
                    {u.kwota > 0 ? `${u.tekst}: ${formatZl(u.kwota)}` : u.tekst}
                  </span>
                  {p.splitNote ? (
                    <span className="rounded-full border border-amber-brand/35 px-2 py-0.5 text-amber-brand">
                      {p.splitNote}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Lista pozycji — desktop */}
      <div className="mt-3 hidden overflow-x-auto rounded-xl border border-line sm:block">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface2 text-[10px] uppercase tracking-wide text-dim">
            <tr>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Nazwa</th>
              <th className="px-3 py-2">Kategoria</th>
              <th className="px-3 py-2">Źródło</th>
              <th className="px-3 py-2 text-right">Brutto</th>
              <th className="px-3 py-2">Płatnik</th>
              <th className="px-3 py-2">Udział drugiej osoby</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-dim">
                  Brak pozycji 50/50 w tym zakresie.
                </td>
              </tr>
            ) : (
              lista.map((p) => {
                const u = udzialDrugiej(p);
                return (
                  <tr key={`${p.miesiac}-${p.id}`} className="border-t border-line/60">
                    <td className="px-3 py-2 tabular-nums text-ink">{ddmmrr(p.data)}</td>
                    <td className="px-3 py-2 text-ink">
                      {p.nazwa}
                      {p.splitNote ? <span className="text-amber-brand"> · {p.splitNote}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-dim">{kategoriaLabel(p.kategoria)}</td>
                    <td className="px-3 py-2 text-dim">{ZRODLO_LABEL[p.zrodlo]}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-white">{formatZl(p.brutto)}</td>
                    <td className="px-3 py-2 text-dim">{p.paidBy}</td>
                    <td className={cn("px-3 py-2", u.kwota > 0 ? "text-green-200" : "text-dim")}>
                      {u.kwota > 0 ? `${u.tekst}: ${formatZl(u.kwota)}` : u.tekst}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Wiersz({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-dim">{label}</span>
      <span className="tabular-nums font-bold text-white">{value}</span>
    </div>
  );
}
