"use client";

// Panel Powiadomień — toggle Web Push + historia z notifications_log (realtime)

import { useEffect, useState, useCallback } from "react";
import { pushSupported, subscribePush, unsubscribePush, isPushActive } from "@/lib/push";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { Card } from "../ui/Card";
import {
  IconBell,
  IconBellOff,
  IconNotes,
  IconTrendingUp,
  IconGasStation,
  IconCalendar,
  IconCheck,
  IconAlertTriangle,
  IconChevronDown,
} from "../ui/icons";
import { cn } from "@/lib/utils";

interface NotificationRow {
  id: string;
  user_name: string;
  action: string;
  description: string;
  url?: string | null;
  read: boolean;
  created_at: string;
}

interface Props {
  token: string; // workspace id
  userName: string;
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

function eventIcon(action: string) {
  if (action.startsWith("zgloszenie")) return <IconAlertTriangle size={14} />;
  if (action.startsWith("faktura")) return <IconTrendingUp size={14} />;
  if (action.startsWith("notatka")) return <IconNotes size={14} />;
  if (action.startsWith("koszt") || action.startsWith("paliwo")) return <IconGasStation size={14} />;
  if (action.startsWith("przypomnienie")) return <IconCalendar size={14} />;
  return <IconBell size={14} />;
}

export function PowiadomieniaPanel({ token }: Props) {
  const supported = pushSupported();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<NotificationRow[]>([]);
  const [rozwiniete, setRozwiniete] = useState(false);

  useEffect(() => {
    if (supported) isPushActive().then(setActive);
  }, [supported]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications/${token}`);
      if (!res.ok) return;
      const json = await res.json();
      setHistory(json.notifications ?? []);
    } catch {
      // Brak Supabase / sesji — pusta historia
    }
  }, [token]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Realtime: nowe powiadomienia pojawiają się bez odświeżania
  useEffect(() => {
    try {
      const supabase = getBrowserSupabase();
      const channel = supabase
        .channel("notifications")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications_log",
            filter: `workspace_id=eq.${token}`,
          },
          (payload) => {
            setHistory((prev) => [payload.new as NotificationRow, ...prev].slice(0, 50));
          }
        )
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    } catch {
      // brak konfiguracji — bez realtime
    }
  }, [token]);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (active) {
        await unsubscribePush();
        setActive(false);
      } else {
        const ok = await subscribePush();
        setActive(ok);
        if (!ok) alert("Nie udało się włączyć powiadomień — sprawdź zgodę w przeglądarce.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function markAllRead() {
    setHistory((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch(`/api/notifications/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read" }),
      });
    } catch {
      // ignoruj
    }
  }

  async function clearHistory() {
    if (!window.confirm("Wyczyścić historię powiadomień?")) return;
    try {
      await fetch(`/api/notifications/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      setHistory([]);
    } catch {
      // ignoruj
    }
  }

  function formatDataCzas(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  const unread = history.filter((n) => !n.read).length;

  return (
    <Card>
      {/* Nagłówek — klik rozwija/zwija; pokazuje licznik nieprzeczytanych */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setRozwiniete((v) => !v)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
          title={rozwiniete ? "Zwiń" : "Rozwiń"}
        >
          <IconBell size={18} className="text-amber-brand shrink-0" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-dim">
            Powiadomienia
          </h3>
          {unread > 0 && (
            <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-brand text-amber-ink text-[11px] font-bold flex items-center justify-center tabular-nums">
              {unread}
            </span>
          )}
          <IconChevronDown
            size={16}
            className={cn(
              "shrink-0 text-dim transition-transform duration-150",
              rozwiniete && "rotate-180"
            )}
          />
        </button>

        {supported && (
          <button
            onClick={toggle}
            disabled={busy}
            title={active ? "Wyłącz powiadomienia" : "Włącz powiadomienia"}
            className={cn(
              "shrink-0 relative w-11 h-6 rounded-full transition-colors duration-150 disabled:opacity-50",
              active ? "bg-amber-brand" : "bg-line"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-150",
                active ? "left-[22px]" : "left-0.5"
              )}
            />
          </button>
        )}
      </div>

      {/* Podgląd najnowszego, gdy zwinięte i jest co pokazać */}
      {!rozwiniete && history.length > 0 && (
        <button
          type="button"
          onClick={() =>
            history[0].url ? window.location.assign(history[0].url) : setRozwiniete(true)
          }
          className="mt-2 w-full text-left flex items-start gap-2 rounded-lg bg-surface2 px-3 py-2 hover:bg-surface transition-colors"
        >
          <span className="shrink-0 text-amber-brand mt-0.5">{eventIcon(history[0].action)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ink leading-snug truncate">{history[0].description}</p>
            <p className="text-[11px] text-dim/60 mt-0.5">{relativeTime(history[0].created_at)}</p>
          </div>
        </button>
      )}

      {/* Rozwinięta zawartość */}
      {rozwiniete && (
        <div className="mt-3">
          {/* Status push */}
          {!supported ? (
            <p className="flex items-center gap-1.5 text-xs text-dim mb-3">
              <IconBellOff size={14} />
              Powiadomienia push niedostępne w tej przeglądarce.
            </p>
          ) : active ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-soft border border-green-500/40 text-green-300 text-xs font-medium mb-3">
              <IconCheck size={13} />
              Aktywne na tym urządzeniu
            </span>
          ) : (
            <p className="text-xs text-dim mb-3">
              Kliknij przełącznik, żeby otrzymywać powiadomienia na ten telefon.
            </p>
          )}

          {/* Historia */}
          {history.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-sm text-dim/60">Brak powiadomień</p>
            </div>
          ) : (
            <>
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="mb-2 text-[11px] text-amber-brand hover:text-[#e09420] transition-colors"
                >
                  Oznacz wszystkie jako przeczytane ({unread})
                </button>
              )}
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {history.map((n) => {
                  const klikalne = !!n.url;
                  const Wrapper = klikalne ? "button" : "div";
                  return (
                    <Wrapper
                      key={n.id}
                      onClick={klikalne ? () => window.location.assign(n.url!) : undefined}
                      className={cn(
                        "w-full text-left flex items-start gap-2 rounded-lg bg-surface2 px-3 py-2 transition-colors",
                        !n.read && "border-l-2 border-l-amber-brand",
                        klikalne && "hover:bg-surface cursor-pointer"
                      )}
                    >
                      <span className="shrink-0 text-amber-brand mt-0.5">
                        {eventIcon(n.action)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-ink leading-snug">{n.description}</p>
                        <p className="text-[11px] text-dim/60 mt-0.5" title={formatDataCzas(n.created_at)}>
                          {relativeTime(n.created_at)} · {formatDataCzas(n.created_at)}
                          {klikalne && <span className="text-amber-brand"> · kliknij, aby otworzyć →</span>}
                        </p>
                      </div>
                    </Wrapper>
                  );
                })}
              </div>
              <button
                onClick={clearHistory}
                className="mt-3 w-full text-center text-[11px] text-dim/60 hover:text-dim transition-colors duration-150"
              >
                Wyczyść historię
              </button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
