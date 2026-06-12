"use client";

// Zakładka Podsumowanie — karta P&L z wyróżnionym zyskiem

import { useMemo, ReactNode } from "react";
import { DaneMiesiaca, MiesiącId, Notatka } from "@/lib/types";
import { obliczWynikMiesiaca, formatZl, formatZlCaly } from "@/lib/business-logic";
import { POLSKIE_MIESIACE } from "@/lib/dates";
import { Card } from "../ui/Card";
import { NotatkiPanel } from "../panels/NotatkiPanel";
import { PowiadomieniaPanel } from "../panels/PowiadomieniaPanel";
import { PodatkiCard } from "../PodatkiCard";
import { PodatkiMiesiaca } from "@/lib/tax";
import { logChange } from "@/lib/audit";
import {
  IconTrendingUp,
  IconUsers,
  IconGasStation,
  IconPackage,
  IconCar,
  IconMoneybag,
  IconCheck,
  IconCalendar,
} from "../ui/icons";
import { cn } from "@/lib/utils";

function Row({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-line last:border-0">
      <span className="text-dim shrink-0">{icon}</span>
      <span className="text-sm text-ink flex-1">{label}</span>
      <span className={cn("tabular-nums text-sm font-semibold", valueClass ?? "text-ink")}>
        {formatZl(value)}
      </span>
    </div>
  );
}

interface PodsumowanieProps {
  miesiac: MiesiącId;
  dane: DaneMiesiaca;
  token: string;
  userName: string;
  notatki: Notatka[];
  onUpdateNotatki: (updater: (prev: Notatka[]) => Notatka[]) => void;
  onUpdate?: (updater: (prev: DaneMiesiaca) => DaneMiesiaca) => void;
  isAdmin?: boolean;
  // Szacunek podatkowy miesiąca (tylko admin)
  podatki?: PodatkiMiesiaca;
  taxForm?: "skala" | "liniowy";
}

export function PodsumowanieTab({
  miesiac,
  dane,
  token,
  userName,
  notatki,
  onUpdateNotatki,
  onUpdate,
  isAdmin = false,
  podatki,
  taxForm = "skala",
}: PodsumowanieProps) {
  const wynik = useMemo(() => obliczWynikMiesiaca(miesiac, dane), [miesiac, dane]);
  const zyskDodatni = wynik.zysk >= 0;

  const wyplata = dane.wyplata ?? { status: "niewypłacone" as const };
  const wyplacone = wyplata.status === "wypłacone";

  function oznaczWyplate() {
    if (!onUpdate) return;
    const nazwa = POLSKIE_MIESIACE[miesiac];
    if (wyplacone) {
      if (!window.confirm(`Cofnąć oznaczenie wypłaty za ${nazwa} 2026?`)) return;
      onUpdate((prev) => ({ ...prev, wyplata: { status: "niewypłacone" } }));
      return;
    }
    if (
      !window.confirm(
        `Na pewno oznaczyć wypłatę za ${nazwa} 2026 (${formatZlCaly(wynik.wynagrodzeniePracownika)}) jako wypłaconą?`
      )
    ) return;

    onUpdate((prev) => ({
      ...prev,
      wyplata: {
        status: "wypłacone",
        paidAt: new Date().toISOString(),
        paidBy: userName,
      },
    }));
    logChange({
      workspaceId: token,
      userName,
      action: "wyplata_oznaczona",
      entity: "payroll",
      entityId: String(miesiac),
      description: `${userName} oznaczył wypłatę kierowcy ${nazwa} 2026 (${formatZlCaly(wynik.wynagrodzeniePracownika)}) jako wypłaconą`,
      url: `/admin?miesiac=${miesiac}&zakladka=podsumowanie`,
    });
  }

  return (
    <div className="space-y-4">
      {/* Karta P&L */}
      <Card>
        <h2 className="text-lg font-bold text-white mb-4">
          {POLSKIE_MIESIACE[miesiac]} 2026 — Rachunek zysków i strat
        </h2>

        {/* PRZYCHÓD */}
        <div className="mb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-brand mb-1">Przychód</p>
          <Row
            icon={<IconTrendingUp size={18} />}
            label="Faktury za miesiąc"
            value={wynik.przychod}
            valueClass="text-green-400"
          />
        </div>

        {/* KOSZTY */}
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-dim mb-1">Koszty</p>
          <Row icon={<IconUsers size={18} />} label="Wynagrodzenie kierowcy" value={wynik.wynagrodzeniePracownika} />
          <Row icon={<IconGasStation size={18} />} label="Paliwo" value={wynik.paliwo} />
          <Row icon={<IconPackage size={18} />} label="Inne koszty" value={wynik.inne} />
          <Row icon={<IconCar size={18} />} label="Leasing" value={wynik.leasing} />
        </div>

        {/* ZYSK NA CZYSTO */}
        <div
          className="flex items-center gap-3 rounded-2xl px-4 py-4"
          style={{ background: zyskDodatni ? "var(--green-bg)" : "var(--red-bg)" }}
        >
          <span className={zyskDodatni ? "text-green-400" : "text-red-400"}>
            <IconMoneybag size={26} />
          </span>
          <span className="text-sm font-bold text-white uppercase tracking-wide flex-1">
            Zysk na czysto
          </span>
          <span
            className={cn(
              "tabular-nums text-[28px] font-extrabold leading-none",
              zyskDodatni ? "text-green-300" : "text-red-300"
            )}
          >
            {formatZl(wynik.zysk)}
          </span>
        </div>
      </Card>

      {/* Wypłata kierowcy (tylko admin) */}
      {isAdmin && (
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <IconUsers size={18} className="text-amber-brand" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-dim">
              {POLSKIE_MIESIACE[miesiac]} 2026 — Wypłata kierowcy
            </h3>
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xl font-extrabold text-white tabular-nums">
                {formatZlCaly(wynik.wynagrodzeniePracownika)}
              </p>
              <p className={cn("text-xs mt-0.5 flex items-center gap-1.5", wyplacone ? "text-green-300" : "text-dim")}>
                <span className={cn("w-1.5 h-1.5 rounded-full", wyplacone ? "bg-green-400" : "bg-amber-brand")} />
                {wyplacone
                  ? `Wypłacone${wyplata.paidAt ? ` — ${new Date(wyplata.paidAt).toLocaleDateString("pl-PL")}` : ""}${wyplata.paidBy ? ` (${wyplata.paidBy})` : ""}`
                  : "Niewypłacone"}
              </p>
            </div>
            <button
              onClick={oznaczWyplate}
              className={cn(
                "px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold transition-all duration-150",
                wyplacone
                  ? "border border-line text-dim hover:text-ink"
                  : "bg-amber-brand text-amber-ink hover:bg-[#e09420]"
              )}
            >
              {wyplacone ? "Cofnij oznaczenie" : "Oznacz jako wypłacone"}
            </button>
          </div>
        </Card>
      )}

      {/* Podatki — szacunek (tylko admin) */}
      {isAdmin && podatki && <PodatkiCard p={podatki} taxForm={taxForm} />}

      {/* Notatki + Powiadomienia: 2 kolumny na desktop, stack na mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <NotatkiPanel
          token={token}
          miesiac={miesiac}
          notatki={notatki}
          userName={userName}
          onUpdate={onUpdateNotatki}
        />
        <PowiadomieniaPanel token={token} userName={userName} />
      </div>

      {/* Statystyki — pille */}
      <Card>
        <div className="flex flex-wrap gap-2">
          <span className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-surface2 border border-line text-sm">
            <IconCalendar size={16} className="text-dim" />
            <span className="text-dim">Soboty:</span>
            <span className="font-bold text-white tabular-nums">
              {wynik.liczbaSobotPrzepracowanych} / 4
            </span>
          </span>

          <span
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-full border text-sm",
              wynik.premiaUwzglednioneod4Soboty
                ? "bg-green-soft border-green-500/40"
                : "bg-surface2 border-line"
            )}
          >
            <IconCheck
              size={16}
              className={wynik.premiaUwzglednioneod4Soboty ? "text-green-400" : "text-dim"}
            />
            <span className="text-dim">Premia:</span>
            <span
              className={cn(
                "font-bold tabular-nums",
                wynik.premiaUwzglednioneod4Soboty ? "text-green-300" : "text-dim"
              )}
            >
              {wynik.premiaUwzglednioneod4Soboty ? "+ 200 zł" : "brak"}
            </span>
          </span>
        </div>

        {/* Szczegóły wynagrodzenia */}
        <div className="mt-4 pt-3 border-t border-line">
          <p className="text-xs text-dim uppercase tracking-wider font-bold mb-2">
            Szczegóły wynagrodzenia
          </p>
          <div className="flex justify-between text-sm py-1">
            <span className="text-dim">Suma dniówek</span>
            <span className="tabular-nums text-ink">{formatZlCaly(wynik.sumaDniowek)}</span>
          </div>
          <div className="flex justify-between text-sm py-1">
            <span className="text-dim">Premia (≥4 soboty)</span>
            <span className={cn("tabular-nums", wynik.premia > 0 ? "text-amber-brand" : "text-dim")}>
              {wynik.premia > 0 ? `+ ${formatZlCaly(wynik.premia)}` : "0 zł"}
            </span>
          </div>
          <div className="flex justify-between text-sm pt-2 border-t border-line font-bold">
            <span className="text-white">Łącznie wynagrodzenie</span>
            <span className="tabular-nums text-white">{formatZlCaly(wynik.wynagrodzeniePracownika)}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
