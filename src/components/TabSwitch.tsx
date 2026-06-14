"use client";

// Zakładki w headerze — aktywna ma dolną linię bursztynową 2px

import { cn } from "@/lib/utils";

export type TabName =
  | "podsumowanie"
  | "zarobek"
  | "koszty"
  | "raport"
  | "wiadomosci"
  | "ustawienia";

const TABS: { id: TabName; label: string; short: string }[] = [
  { id: "podsumowanie", label: "Podsumowanie", short: "Podsum." },
  { id: "zarobek", label: "Zarobek", short: "Zarobek" },
  { id: "koszty", label: "Koszty", short: "Koszty" },
  { id: "raport", label: "Raport", short: "Raport" },
  { id: "wiadomosci", label: "Wiadomości", short: "Wiad." },
  { id: "ustawienia", label: "Ustawienia", short: "Ustaw." },
];

interface TabSwitchProps {
  active: TabName;
  onChange: (tab: TabName) => void;
  // Wiadomości i Ustawienia tylko dla admina
  showHistoria?: boolean;
}

export function TabSwitch({ active, onChange, showHistoria = false }: TabSwitchProps) {
  const tabs = TABS.filter(
    (t) => (t.id !== "wiadomosci" && t.id !== "ustawienia") || showHistoria
  );
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
