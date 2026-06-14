"use client";

// Powiadomienia kierowcy — tylko jego sprawy: dniówki, obciążenia, notatki do
// niego. Czytane z /api/driver/notifications (whitelist akcji, bez linków do admina).

import { useCallback, useEffect, useState } from "react";
import { Card } from "./ui/Card";
import {
  IconBell,
  IconLoader,
  IconMoneybag,
  IconNotes,
  IconAlertTriangle,
  IconChevronDown,
} from "./ui/icons";
import { cn } from "@/lib/utils";

interface Powiadomienie {
  id: string;
  action: string;
  description: string;
  created_at: string;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "przed chwilą";
  if (min < 60) return `${min} min temu`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} godz. temu`;
  const d = Math.floor(h / 24);
  if (d === 1) return "wczoraj";
  return `${d} dni temu`;
}

function ikona(action: string) {
  if (action.startsWith("obciazenie")) return <IconAlertTriangle size={14} />;
  if (action.startsWith("notatka")) return <IconNotes size={14} />;
  if (action.startsWith("wyplata")) return <IconMoneybag size={14} />;
  return <IconBell size={14} />;
}

export function PowiadomieniaKierowcy() {
  const [lista, setLista] = useState<Powiadomienie[] | null>(null);
  const [rozwiniete, setRozwiniete] = useState(false);

  const wczytaj = useCallback(async () => {
    try {
      const r = await fetch("/api/driver/notifications");
      if (!r.ok) return;
      const j = await r.json();
      setLista(j.notifications ?? []);
    } catch {
      setLista([]);
    }
  }, []);

  useEffect(() => {
    wczytaj();
  }, [wczytaj]);

  const widoczne = rozwiniete ? (lista ?? []) : (lista ?? []).slice(0, 4);

  return (
    <Card>
      <button
        type="button"
        onClick={() => setRozwiniete((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <IconBell size={18} className="text-amber-brand shrink-0" />
        <h2 className="flex-1 text-sm font-bold text-white">Powiadomienia</h2>
        {(lista?.length ?? 0) > 4 && (
          <IconChevronDown
            size={16}
            className={cn("text-dim transition-transform", rozwiniete && "rotate-180")}
          />
        )}
      </button>

      <div className="mt-3 space-y-1.5">
        {lista === null ? (
          <div className="flex items-center gap-2 text-dim text-sm py-2 justify-center">
            <IconLoader size={15} /> Ładowanie…
          </div>
        ) : lista.length === 0 ? (
          <p className="text-sm text-dim/60 text-center py-2">Brak powiadomień.</p>
        ) : (
          widoczne.map((n) => (
            <div key={n.id} className="flex items-start gap-2 rounded-lg bg-surface2 px-3 py-2">
              <span className="shrink-0 text-amber-brand mt-0.5">{ikona(n.action)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink leading-snug">{n.description}</p>
                <p className="text-[11px] text-dim/60 mt-0.5">{relativeTime(n.created_at)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
