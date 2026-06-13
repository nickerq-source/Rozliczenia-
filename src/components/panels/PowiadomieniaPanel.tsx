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

export function PowiadomieniaPanel({ token, userName }: Props) {
  const supported = pushSupported();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [history, setHistory] = useState<NotificationRow[]>([]);
  const [rozwiniete, setRozwiniete] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<"off" | "connecting" | "on" | "error">(
    "off"
  );

  useEffect(() => {
    if (supported) isPushActive().then(setActive);
  }, [supported]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications/${token}`);
      if (!res.ok) {
        const text = await res.text();
        setLoadError(text || `Błąd pobierania powiadomień (${res.status})`);
        return;
      }
      const json = await res.json();
      setHistory(json.notifications ?? []);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Błąd pobierania powiadomień");
    }
  }, [token]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Realtime: nowe powiadomienia pojawiają się bez odświeżania
  useEffect(() => {
    try {
      const supabase = getBrowserSupabase();
      setRealtimeStatus("connecting");
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
            setLoadError(null);
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") setRealtimeStatus("on");
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setRealtimeStatus("error");
          }
        });
      return () => { supabase.removeChannel(channel); };
    } catch (error) {
      setRealtimeStatus("error");
      setLoadError(error instanceof Error ? error.message : "Błąd realtime powiadomień");
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

  async function sendTestPush() {
    if (testBusy || busy) return;
    setTestBusy(true);
    try {
      if (!supported) {
        alert("Powiadomienia push są niedostępne w tej przeglądarce.");
        return;
      }

      if (!active) {
        const ok = await subscribePush();
        setActive(ok);
        if (!ok) {
          alert("Nie udało się włączyć powiadomień — sprawdź zgodę w przeglądarce.");
          return;
        }
      }

      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_push",
          entity: "notification",
          description: `${userName} wysłał test powiadomień PapiTrans`,
          url: "/admin?zakladka=podsumowanie",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error ?? `Błąd testu push (${res.status})`);
      }
      await loadHistory();
      const push = json.push;
      alert(
        push
          ? `Test zapisany. Subskrypcje: ${push.subscriptions}, wysłano: ${push.sent}, błędy: ${push.failed}.`
          : "Test zapisany. Jeśli push nie przyszedł, włącz powiadomienia ponownie na telefonie."
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Błąd testu push";
      setLoadError(message);
      alert(message);
    } finally {
      setTestBusy(false);
    }
  }

  function formatDataCzas(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  const unread = history.filter((n) => !n.read).length;
  const latest = history[0];

  return (
    <Card>
      {/* Nagłówek + osobny pasek kontrolek, żeby na mobile nic nie nachodziło. */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setRozwiniete((v) => !v)}
          className="flex w-full items-center gap-2 text-left"
          title={rozwiniete ? "Zwiń" : "Rozwiń"}
        >
          <IconBell size={18} className="text-amber-brand shrink-0" />
          <h3 className="min-w-0 flex-1 truncate text-sm font-bold uppercase tracking-wider text-dim">
            Powiadomienia
          </h3>
          <IconChevronDown
            size={16}
            className={cn(
              "shrink-0 text-dim transition-transform duration-150",
              rozwiniete && "rotate-180"
            )}
          />
        </button>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
              loadError
                ? "bg-red-soft text-red-200"
                : active
                  ? "bg-green-soft text-green-300"
                  : "bg-surface2 text-dim"
            )}
          >
            {loadError ? (
              <>
                <IconAlertTriangle size={12} />
                Błąd
              </>
            ) : active ? (
              <>
                <IconCheck size={12} />
                Push aktywny
              </>
            ) : (
              <>
                <IconBellOff size={12} />
                Push wył.
              </>
            )}
          </span>

          <span className="inline-flex items-center gap-1 rounded-full bg-surface2 px-2.5 py-1 text-dim tabular-nums">
            {unread > 0 ? `${unread} nowych` : `${history.length} w historii`}
          </span>

          {supported && (
            <button
              type="button"
              onClick={sendTestPush}
              disabled={testBusy || busy}
              className="inline-flex items-center gap-1 rounded-full border border-amber-brand/50 px-2.5 py-1 text-amber-brand font-bold hover:bg-amber-brand/10 disabled:opacity-50"
              title="Wyślij testowe powiadomienie na to urządzenie"
            >
              <IconBell size={12} />
              {testBusy ? "..." : "Test push"}
            </button>
          )}

          {supported && (
            <button
              onClick={toggle}
              disabled={busy}
              title={active ? "Wyłącz powiadomienia" : "Włącz powiadomienia"}
              className={cn(
                "ml-auto shrink-0 relative w-11 h-6 rounded-full transition-colors duration-150 disabled:opacity-50",
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
      </div>

      {/* Podgląd najnowszego, gdy zwinięte i jest co pokazać */}
      {!rozwiniete && latest && (
        <button
          type="button"
          onClick={() =>
            latest.url ? window.location.assign(latest.url) : setRozwiniete(true)
          }
          className="mt-2 w-full text-left flex items-start gap-2 rounded-lg bg-surface2 px-3 py-2 hover:bg-surface transition-colors"
        >
          <span className="shrink-0 text-amber-brand mt-0.5">{eventIcon(latest.action)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ink leading-snug truncate">{latest.description}</p>
            <p className="text-[11px] text-dim/60 mt-0.5">
              {relativeTime(latest.created_at)}
              {latest.url && <span className="text-amber-brand"> · kliknij, aby otworzyć</span>}
            </p>
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
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-soft border border-green-500/40 text-green-300 text-xs font-medium">
                <IconCheck size={13} />
                Aktywne na tym urządzeniu
              </span>
            </div>
          ) : (
            <p className="text-xs text-dim mb-3">
              Kliknij przełącznik, żeby otrzymywać powiadomienia na ten telefon.
            </p>
          )}

          {loadError && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-soft border border-red-500/30 px-3 py-2 text-xs text-red-100">
              <IconAlertTriangle size={14} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Nie udało się pobrać powiadomień.</p>
                <p className="mt-0.5 text-red-100/70 break-words">{loadError}</p>
              </div>
            </div>
          )}

          {realtimeStatus === "error" && !loadError && (
            <p className="mb-3 text-[11px] text-dim">
              Historia działa, ale odświeżanie na żywo jest chwilowo niedostępne.
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
