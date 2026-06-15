"use client";

// Zakładki w headerze — aktywna ma dolną linię bursztynową 2px

import { cn } from "@/lib/utils";

export type TabName =
  | "podsumowanie"
  | "zarobek"
  | "koszty"
  | "raport"
  | "wiadomosci"
  | "legenda"
  | "ustawienia";

const TABS: { id: TabName; label: string; short: string }[] = [
  { id: "podsumowanie", label: "Podsumowanie", short: "Podsum." },
  { id: "zarobek", label: "Zarobek", short: "Zarobek" },
  { id: "koszty", label: "Koszty", short: "Koszty" },
  { id: "raport", label: "Raport", short: "Raport" },
  { id: "wiadomosci", label: "Wiadomości", short: "Wiad." },
  { id: "legenda", label: "Legenda", short: "Legenda" },
  { id: "ustawienia", label: "Ustawienia", short: "Ustaw." },
];

const TYLKO_ADMIN: TabName[] = ["wiadomosci", "legenda", "ustawienia"];

interface TabSwitchProps {
  active: TabName;
  onChange: (tab: TabName) => void;
  // Wiadomości, Legenda i Ustawienia tylko dla admina
  showHistoria?: boolean;
}

export function TabSwitch({ active, onChange, showHistoria = false }: TabSwitchProps) {
  const tabs = TABS.filter((t) => !TYLKO_ADMIN.includes(t.id) || showHistoria);
  return (
    <div className="flex w-full">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex-1 py-2 min-h-[40px] text-sm font-medium transition-all duration-150 border-b-2 -mb-px",
            active === tab.id
              ? "border-amber-brand text-white font-bold"
              : "border-transparent text-dim hover:text-ink"
          )}
        >
          <span className="hidden sm:inline">{tab.label}</span>
          <span className="sm:hidden">{tab.short}</span>
        </button>
      ))}
    </div>
  );
}
