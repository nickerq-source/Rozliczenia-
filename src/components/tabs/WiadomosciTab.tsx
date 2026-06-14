"use client";

// Zakładka Wiadomości — wspólne miejsce na: notatki (wewnętrzne + wątek z
// kierowcą), powiadomienia i historię zmian. Tylko admin.

import { useState } from "react";
import { Notatka } from "@/lib/types";
import { NotatkiPanel } from "../panels/NotatkiPanel";
import { PowiadomieniaPanel } from "../panels/PowiadomieniaPanel";
import { HistoriaTab } from "./HistoriaTab";
import { cn } from "@/lib/utils";
import { IconNotes, IconBell, IconHistory } from "../ui/icons";

type Sekcja = "notatki" | "powiadomienia" | "historia";

interface Props {
  token: string;
  miesiac: number;
  notatki: Notatka[];
  userName: string;
  onUpdateNotatki: (updater: (prev: Notatka[]) => Notatka[]) => void;
}

const SEKCJE: { id: Sekcja; label: string; icon: React.ReactNode }[] = [
  { id: "notatki", label: "Notatki", icon: <IconNotes size={15} /> },
  { id: "powiadomienia", label: "Powiadomienia", icon: <IconBell size={15} /> },
  { id: "historia", label: "Historia", icon: <IconHistory size={15} /> },
];

export function WiadomosciTab({ token, miesiac, notatki, userName, onUpdateNotatki }: Props) {
  const [sekcja, setSekcja] = useState<Sekcja>("notatki");
  const [kanal, setKanal] = useState<"kierowca" | "admin">("kierowca");

  const nieprzeczytaneOdKierowcy = notatki.filter(
    (n) => n.kanal === "kierowca" && n.odKierowcy
  ).length;

  return (
    <div className="space-y-4">
      {/* Pod-nawigacja */}
      <div className="flex gap-1.5 rounded-2xl bg-surface2 border border-line p-1.5">
        {SEKCJE.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSekcja(s.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 min-h-[40px] rounded-xl text-xs sm:text-sm font-medium transition-colors",
              sekcja === s.id
                ? "bg-amber-brand text-amber-ink font-bold"
                : "text-dim hover:text-ink"
            )}
          >
            {s.icon}
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {sekcja === "notatki" && (
        <>
          {/* Przełącznik kanału */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setKanal("kierowca")}
              className={cn(
                "flex-1 py-2 min-h-[40px] rounded-xl text-sm font-medium border transition-colors",
                kanal === "kierowca"
                  ? "bg-amber-brand/15 border-amber-brand text-amber-brand font-bold"
                  : "border-line text-dim hover:text-ink"
              )}
            >
              Wątek z kierowcą
              {nieprzeczytaneOdKierowcy > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-green-500 text-white text-[10px] font-bold">
                  {nieprzeczytaneOdKierowcy}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setKanal("admin")}
              className={cn(
                "flex-1 py-2 min-h-[40px] rounded-xl text-sm font-medium border transition-colors",
                kanal === "admin"
                  ? "bg-amber-brand/15 border-amber-brand text-amber-brand font-bold"
                  : "border-line text-dim hover:text-ink"
              )}
            >
              Wewnętrzne
            </button>
          </div>

          <p className="text-xs text-dim -mt-1 px-1">
            {kanal === "kierowca"
              ? "Widzi je kierowca w swoim panelu i może odpisać. Nie pokazuj tu nic poufnego."
              : "Tylko dla administratorów — kierowca tego nie widzi."}
          </p>

          <NotatkiPanel
            key={kanal}
            token={token}
            miesiac={miesiac}
            notatki={notatki}
            userName={userName}
            onUpdate={onUpdateNotatki}
            kanal={kanal}
            wszystkieMiesiace
          />
        </>
      )}

      {sekcja === "powiadomienia" && <PowiadomieniaPanel token={token} userName={userName} />}

      {sekcja === "historia" && <HistoriaTab token={token} />}
    </div>
  );
}
