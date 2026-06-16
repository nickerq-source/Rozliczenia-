"use client";

// Wątek wiadomości kierowca ↔ admin w panelu kierowcy. Kierowca widzi tylko
// kanał "kierowca" (notatki od adminów dla niego) i może odpisać. Nie widzi
// wewnętrznych notatek ani powiadomień adminów.

import { useCallback, useEffect, useState } from "react";
import { Card } from "./ui/Card";
import { IconNotes, IconLoader, IconCheck } from "./ui/icons";
import { cn } from "@/lib/utils";
import { DriverLanguage, driverTexts } from "@/lib/driver-translations";

interface Wiadomosc {
  id: string;
  tresc: string;
  autor: string;
  odKierowcy: boolean;
  dataWydarzenia?: string | null;
  readByDriverAt?: string | null;
  dataUtworzenia: string;
}

function formatCzas(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function WiadomosciKierowcy({
  lang,
  onUnreadChange,
}: {
  lang: DriverLanguage;
  onUnreadChange?: (count: number) => void;
}) {
  const t = driverTexts(lang);
  const [lista, setLista] = useState<Wiadomosc[] | null>(null);
  const [tresc, setTresc] = useState("");
  const [busy, setBusy] = useState(false);
  const [readBusyId, setReadBusyId] = useState<string | null>(null);
  const [readErrorId, setReadErrorId] = useState<string | null>(null);

  const wczytaj = useCallback(async () => {
    try {
      const r = await fetch("/api/driver/notes");
      if (!r.ok) return;
      const j = await r.json();
      setLista(j.notatki ?? []);
      onUnreadChange?.(j.unreadCount ?? 0);
    } catch {
      setLista([]);
      onUnreadChange?.(0);
    }
  }, [onUnreadChange]);

  useEffect(() => {
    wczytaj();
  }, [wczytaj]);

  async function wyslij() {
    const t = tresc.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/driver/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tresc: t }),
      });
      if (r.ok) {
        setTresc("");
        await wczytaj();
      }
    } catch {
      /* spróbuje ponownie */
    } finally {
      setBusy(false);
    }
  }

  async function potwierdzPrzeczytanie(id: string) {
    if (readBusyId) return;
    setReadBusyId(id);
    setReadErrorId(null);
    try {
      const r = await fetch("/api/driver/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "read" }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? t.messages.readError);
      setLista((prev) =>
        prev?.map((w) =>
          w.id === id ? { ...w, readByDriverAt: j.readAt ?? new Date().toISOString() } : w
        ) ?? prev
      );
      onUnreadChange?.(j.unreadCount ?? 0);
    } catch {
      setReadErrorId(id);
    } finally {
      setReadBusyId(null);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-2">
        <IconNotes size={18} className="text-amber-brand" />
        <h2 className="text-sm font-bold text-white">{t.messages.title}</h2>
      </div>
      <p className="text-xs text-dim mt-1">{t.messages.intro}</p>

      {/* Pisanie */}
      <div className="mt-3 space-y-2">
        <textarea
          value={tresc}
          onChange={(e) => setTresc(e.target.value)}
          rows={2}
          placeholder={t.messages.placeholder}
          className="w-full bg-input border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder:text-dim/40 resize-y"
        />
        <button
          type="button"
          onClick={wyslij}
          disabled={busy || !tresc.trim()}
          className="w-full py-2 min-h-[40px] rounded-xl bg-amber-brand text-amber-ink font-bold text-sm hover:bg-[#e09420] disabled:opacity-40 flex items-center justify-center gap-1.5"
        >
          {busy ? <IconLoader size={14} /> : <IconCheck size={14} />} {t.messages.send}
        </button>
      </div>

      {/* Wątek */}
      <div className="mt-3 space-y-2">
        {lista === null ? (
          <div className="flex items-center gap-2 text-dim text-sm py-3 justify-center">
            <IconLoader size={15} /> {t.messages.loading}
          </div>
        ) : lista.length === 0 ? (
          <p className="text-sm text-dim/60 text-center py-3">{t.messages.empty}</p>
        ) : (
          lista.map((w) => (
            <div
              key={w.id}
              className={cn(
                "rounded-xl border p-2.5",
                w.odKierowcy
                  ? "bg-amber-brand/10 border-amber-brand/30 ml-6"
                  : "bg-surface2 border-line mr-6"
              )}
            >
              {!w.odKierowcy && !w.readByDriverAt && (
                <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-red-500/15 border border-red-500/40 px-2 py-0.5 text-[10px] font-bold text-red-300">
                  {t.messages.newNote} · {t.messages.unread}
                </span>
              )}
              <p className="text-sm text-ink whitespace-pre-wrap leading-snug">{w.tresc}</p>
              {w.dataWydarzenia && (
                <p className="mt-1 text-[11px] text-amber-brand tabular-nums">
                  {w.dataWydarzenia.slice(8, 10)}.{w.dataWydarzenia.slice(5, 7)}.{w.dataWydarzenia.slice(0, 4)}
                </p>
              )}
              <p className="text-[11px] text-dim/60 mt-1">
                {w.odKierowcy ? t.messages.you : w.autor} · {formatCzas(w.dataUtworzenia)}
              </p>
              {!w.odKierowcy && (
                <div className="mt-2">
                  {w.readByDriverAt ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-soft border border-green-500/40 px-2 py-1 text-[11px] text-green-300">
                      <IconCheck size={12} /> {t.messages.readConfirmed}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => potwierdzPrzeczytanie(w.id)}
                      disabled={readBusyId === w.id}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-amber-brand px-3 py-1.5 text-xs font-bold text-amber-ink disabled:opacity-50"
                    >
                      {readBusyId === w.id ? <IconLoader size={13} /> : <IconCheck size={13} />}
                      {t.messages.confirmRead}
                    </button>
                  )}
                  {readErrorId === w.id && (
                    <p className="mt-1 text-[11px] text-red-300">{t.messages.readError}</p>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
