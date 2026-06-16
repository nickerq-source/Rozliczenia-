"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SaveStatusBadge } from "./ui/SaveStatus";
import { SaveStatus } from "@/hooks/useWorkspace";
import { TabSwitch, TabName } from "./TabSwitch";
import { IconTruck, IconLock, IconLogout, IconChevronDown } from "./ui/icons";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { POLSKIE_MIESIACE, MIESIACE_ZAKRESU } from "@/lib/dates";
import { MiesiącId } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  saveStatus: SaveStatus;
  aktywnyMiesiac: MiesiącId;
  onMiesiacChange: (m: MiesiącId) => void;
  aktywnaZakladka: TabName;
  onZakladkaChange: (t: TabName) => void;
  userName?: string;
  showHistoria?: boolean;
  lockedMonths?: number[];
}

const MOBILE_MAIN_TABS: { id: TabName; label: string }[] = [
  { id: "podsumowanie", label: "Podsum." },
  { id: "zarobek", label: "Zarobek" },
  { id: "koszty", label: "Koszty" },
  { id: "raport", label: "Raport" },
];

const MOBILE_MORE_TABS: { id: TabName; label: string }[] = [
  { id: "wiadomosci", label: "Wiadomości" },
  { id: "legenda", label: "Legenda" },
  { id: "ustawienia", label: "Ustawienia" },
];

export function AppHeader({
  saveStatus,
  aktywnyMiesiac,
  onMiesiacChange,
  aktywnaZakladka,
  onZakladkaChange,
  userName,
  showHistoria = false,
  lockedMonths = [],
}: AppHeaderProps) {
  const router = useRouter();
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const mobileMoreTabs = showHistoria ? MOBILE_MORE_TABS : [];
  const moreIsActive = mobileMoreTabs.some((tab) => tab.id === aktywnaZakladka);

  async function logout() {
    try {
      await getBrowserSupabase().auth.signOut();
    } catch {
      // brak konfiguracji — i tak przejdź na login
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <header
      className="sticky top-0 z-10 border-b border-line"
      style={{
        background: "rgba(10, 15, 12, 0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div className="max-w-[720px] mx-auto px-3 sm:px-6 pt-2">
        {/* Logo + użytkownik + status zapisu */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <IconTruck size={20} className="text-amber-brand shrink-0" />
            <div className="leading-none flex items-baseline gap-2">
              <span className="logo-gem block text-[19px]">PapiTrans</span>
              <span className="logo-subtitle hidden sm:inline text-[9px]">
                El Jefe de la Ruta
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SaveStatusBadge status={saveStatus} />
            {userName && (
              <span className="text-xs text-dim hidden sm:inline">{userName}</span>
            )}
            <button
              onClick={logout}
              title="Wyloguj"
              className="p-1.5 rounded-lg text-dim hover:text-ink hover:bg-surface2 transition-colors"
            >
              <IconLogout size={16} />
            </button>
          </div>
        </div>

        {/* Przełącznik miesięcy — poziomy scroll na mobile */}
        <div className="flex gap-1 overflow-x-auto scrollbar-none pb-1.5">
          {MIESIACE_ZAKRESU.map((m) => (
            <button
              key={m}
              onClick={() => onMiesiacChange(m as MiesiącId)}
              className={cn(
                "shrink-0 flex items-center gap-1 px-3 py-1 rounded-lg text-[13px] font-medium transition-all duration-150",
                aktywnyMiesiac === m
                  ? "bg-amber-brand text-amber-ink font-bold"
                  : "border border-line text-dim hover:text-ink hover:border-dim"
              )}
            >
              {POLSKIE_MIESIACE[m].slice(0, 3)}
              {lockedMonths.includes(m) && <IconLock size={11} />}
            </button>
          ))}
        </div>

        {/* Zakładki — dolna linia bursztynowa */}
        <TabSwitch
          active={aktywnaZakladka}
          onChange={onZakladkaChange}
          showHistoria={showHistoria}
          className="hidden sm:flex"
        />
      </div>

      {/* Mobilna nawigacja: główne zakładki na dole, reszta pod „Więcej”. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-bg/95 px-2 pt-1.5 shadow-2xl backdrop-blur-xl sm:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.375rem)" }}
        aria-label="Nawigacja mobilna"
      >
        <div className="mx-auto grid max-w-[480px] grid-cols-5 gap-1">
          {MOBILE_MAIN_TABS.map((tab) => {
            const active = aktywnaZakladka === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setMobileMoreOpen(false);
                  onZakladkaChange(tab.id);
                }}
                className={cn(
                  "min-h-[48px] rounded-xl px-1 text-[11px] font-extrabold transition-all",
                  active
                    ? "bg-amber-brand text-amber-ink"
                    : "text-dim hover:bg-surface2 hover:text-ink"
                )}
              >
                {tab.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileMoreOpen((v) => !v)}
            disabled={mobileMoreTabs.length === 0}
            className={cn(
              "flex min-h-[48px] items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-extrabold transition-all disabled:opacity-40",
              moreIsActive || mobileMoreOpen
                ? "bg-amber-brand text-amber-ink"
                : "text-dim hover:bg-surface2 hover:text-ink"
            )}
          >
            Więcej
            <IconChevronDown size={12} className={cn("transition-transform", mobileMoreOpen && "rotate-180")} />
          </button>
        </div>
      </nav>

      {mobileMoreOpen && mobileMoreTabs.length > 0 && (
        <div className="fixed inset-0 z-40 sm:hidden" role="presentation">
          <button
            type="button"
            aria-label="Zamknij menu"
            className="absolute inset-0 bg-black/45"
            onClick={() => setMobileMoreOpen(false)}
          />
          <div
            className="absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] mx-auto max-w-[480px] rounded-2xl border border-line bg-surface p-2 shadow-2xl animate-fade-in"
          >
            {mobileMoreTabs.map((tab) => {
              const active = aktywnaZakladka === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setMobileMoreOpen(false);
                    onZakladkaChange(tab.id);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm font-bold transition-colors",
                    active
                      ? "bg-amber-brand text-amber-ink"
                      : "text-ink hover:bg-surface2"
                  )}
                >
                  {tab.label}
                  {active && <span>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
