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
  dataUtworzenia: string;
}

function formatCzas(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function WiadomosciKierowcy({ lang }: { lang: DriverLanguage }) {
  const t = driverTexts(lang);
  const [lista, setLista] = useState<Wiadomosc[] | null>(null);
  const [tresc, setTresc] = useState("");
  const [busy, setBusy] = useState(false);

  const wczytaj = useCallback(async () => {
    try {
      const r = await fetch("/api/driver/notes");
      if (!r.ok) return;
      const j = await r.json();
      setLista(j.notatki ?? []);
    } catch {
      setLista([]);
    }
  }, []);

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
              <p className="text-sm text-ink whitespace-pre-wrap leading-snug">{w.tresc}</p>
              <p className="text-[11px] text-dim/60 mt-1">
                {w.odKierowcy ? t.messages.you : w.autor} · {formatCzas(w.dataUtworzenia)}
              </p>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
