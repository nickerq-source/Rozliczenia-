"use client";

// Zakładki w headerze — aktywna ma dolną linię bursztynową 2px

import { cn } from "@/lib/utils";

export type TabName =
  | "podsumowanie"
  | "zarobek"
  | "koszty"
  | "zlecenia"
  | "raport"
  | "podatki"
  | "wiadomosci"
  | "legenda"
  | "ustawienia";

const TABS: { id: TabName; label: string; short: string }[] = [
  { id: "podsumowanie", label: "Podsumowanie", short: "Podsum." },
  { id: "zarobek", label: "Zarobek", short: "Zarobek" },
  { id: "koszty", label: "Koszty", short: "Koszty" },
  { id: "zlecenia", label: "Zlecenia", short: "Zlec." },
  { id: "raport", label: "Raport", short: "Raport" },
  { id: "podatki", label: "Podatki", short: "Podatki" },
  { id: "wiadomosci", label: "Wiadomości", short: "Wiad." },
  { id: "legenda", label: "Legenda", short: "Legenda" },
  { id: "ustawienia", label: "Ustawienia", short: "Ustaw." },
];

const TYLKO_ADMIN: TabName[] = ["zlecenia", "podatki", "wiadomosci", "legenda", "ustawienia"];

interface TabSwitchProps {
  active: TabName;
  onChange: (tab: TabName) => void;
  // Wiadomości, Legenda i Ustawienia tylko dla admina
  showHistoria?: boolean;
  className?: string;
}

export function TabSwitch({ active, onChange, showHistoria = false, className }: TabSwitchProps) {
  const tabs = TABS.filter((t) => !TYLKO_ADMIN.includes(t.id) || showHistoria);
  return (
    <nav aria-label="Działy firmy" className={cn("flex w-full flex-wrap gap-1", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          aria-current={active === tab.id ? "page" : undefined}
          className={cn(
            "shrink-0 px-2.5 py-2 min-h-[44px] text-[12px] font-medium transition-all duration-150 border-b-2 -mb-px sm:text-[13px]",
            active === tab.id
              ? "border-amber-brand text-white font-bold"
              : "border-transparent text-dim hover:text-ink"
          )}
        >
          <span className="hidden sm:inline">{tab.label}</span>
          <span className="sm:hidden">{tab.short}</span>
        </button>
      ))}
    </nav>
  );
}
