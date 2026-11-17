"use client";

import { useRouter } from "next/navigation";
import { SaveStatusBadge } from "./ui/SaveStatus";
import { SaveStatus } from "@/hooks/useWorkspace";
import { TabSwitch, TabName } from "./TabSwitch";
import { IconTruck, IconLock, IconLogout } from "./ui/icons";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { POLSKIE_MIESIACE, MIESIACE_ZAKRESU } from "@/lib/dates";
import { MiesiącId } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useEffect, useRef, type ReactNode } from "react";

interface AppHeaderProps {
  navigation?: ReactNode;
  saveStatus: SaveStatus;
  aktywnyMiesiac: MiesiącId;
  onMiesiacChange: (m: MiesiącId) => void;
  aktywnaZakladka: TabName;
  onZakladkaChange: (t: TabName) => void;
  userName?: string;
  showHistoria?: boolean;
  lockedMonths?: number[];
}

export function AppHeader({
  saveStatus,
  aktywnyMiesiac,
  onMiesiacChange,
  aktywnaZakladka,
  onZakladkaChange,
  userName,
  showHistoria = false,
  lockedMonths = [],
  navigation,
}: AppHeaderProps) {
  const router = useRouter();
  const monthStrip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = monthStrip.current;
    const selected = strip?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (strip && selected) strip.scrollLeft = Math.max(0, selected.offsetLeft - strip.offsetLeft - strip.clientWidth / 2 + selected.offsetWidth / 2);
  }, [aktywnyMiesiac]);

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
    <>
      <header
        className="pt-masthead sticky top-0 z-10"
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
        <div ref={monthStrip} className="flex gap-1 overflow-x-auto scrollbar-none pb-1.5">
          {MIESIACE_ZAKRESU.map((m) => (
            <button
              key={m}
              onClick={() => onMiesiacChange(m as MiesiącId)}
              aria-pressed={aktywnyMiesiac === m}
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
        {navigation !== undefined ? navigation : <TabSwitch
          active={aktywnaZakladka}
          onChange={onZakladkaChange}
          showHistoria={showHistoria}
          className="flex"
        />}
        </div>
      </header>
    </>
  );
}
