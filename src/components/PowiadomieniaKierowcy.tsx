"use client";

// Powiadomienia kierowcy — tylko jego sprawy: dniówki, obciążenia, notatki do
// niego. Czytane z /api/driver/notifications (whitelist akcji, bez linków do admina).

import { useCallback, useEffect, useState } from "react";
import { Card } from "./ui/Card";
import { pushSupported, subscribePush, unsubscribePush, isPushActive } from "@/lib/push";
import {
  IconBell,
  IconBellOff,
  IconLoader,
  IconMoneybag,
  IconNotes,
  IconAlertTriangle,
  IconChevronDown,
  IconCheck,
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
  const [supported, setSupported] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

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

  useEffect(() => {
    const ok = pushSupported();
    setSupported(ok);
    if (ok) isPushActive().then(setPushOn);
  }, []);

  async function togglePush() {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (pushOn) {
        await unsubscribePush();
        setPushOn(false);
      } else {
        const ok = await subscribePush();
        setPushOn(ok);
        if (!ok) alert("Nie udało się włączyć powiadomień — sprawdź zgodę w telefonie.");
      }
    } finally {
      setPushBusy(false);
    }
  }

  const widoczne = rozwiniete ? (lista ?? []) : (lista ?? []).slice(0, 4);

  return (
    <Card>
      <div className="flex items-center gap-2">
        <IconBell size={18} className="text-amber-brand shrink-0" />
        <h2 className="flex-1 text-sm font-bold text-white">Powiadomienia</h2>
        {(lista?.length ?? 0) > 4 && (
          <button type="button" onClick={() => setRozwiniete((v) => !v)} title={rozwiniete ? "Zwiń" : "Rozwiń"}>
            <IconChevronDown
              size={16}
              className={cn("text-dim transition-transform", rozwiniete && "rotate-180")}
            />
          </button>
        )}
      </div>

      {/* Push na telefon */}
      {supported && (
        <div className="mt-2 flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]",
              pushOn ? "bg-green-soft text-green-300" : "bg-surface2 text-dim"
            )}
          >
            {pushOn ? <IconCheck size={12} /> : <IconBellOff size={12} />}
            {pushOn ? "Push włączony" : "Push wyłączony"}
          </span>
          <span className="flex-1 text-[11px] text-dim">Powiadomienia na telefon</span>
          <button
            type="button"
            onClick={togglePush}
            disabled={pushBusy}
            title={pushOn ? "Wyłącz powiadomienia" : "Włącz powiadomienia"}
            className={cn(
              "shrink-0 relative w-11 h-6 rounded-full transition-colors disabled:opacity-50",
              pushOn ? "bg-amber-brand" : "bg-line"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all",
                pushOn ? "left-[22px]" : "left-0.5"
              )}
            />
          </button>
        </div>
      )}

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
