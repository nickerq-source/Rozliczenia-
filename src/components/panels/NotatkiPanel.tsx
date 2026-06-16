"use client";

// Panel Notatek — lista notatek miesiąca, dodawanie, edycja inline, usuwanie

import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Notatka, NotatkaKanal } from "@/lib/types";
import { logChange } from "@/lib/audit";
import { POLSKIE_MIESIACE } from "@/lib/dates";
import { Card } from "../ui/Card";
import { IconNotes, IconCalendar, IconTrash, IconPlus } from "../ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  token: string;
  miesiac: number;
  notatki: Notatka[];
  userName: string;
  onUpdate: (updater: (prev: Notatka[]) => Notatka[]) => void;
  kanal?: NotatkaKanal; // domyślnie "admin"; filtruje listę i ustawia na nowych
  wszystkieMiesiace?: boolean; // pokaż notatki kanału ze wszystkich miesięcy
}

function formatDataPL(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function formatCzas(isoDateTime: string): string {
  const d = new Date(isoDateTime);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function NotatkiPanel({ token, miesiac, notatki, userName, onUpdate, kanal = "admin", wszystkieMiesiace = false }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [tresc, setTresc] = useState("");
  const [dataWydarzenia, setDataWydarzenia] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const doKierowcy = kanal === "kierowca";
  const widoczne = notatki.filter(
    (n) => (n.kanal ?? "admin") === kanal && (wszystkieMiesiace || n.miesiac === miesiac)
  );

  function addNotatka() {
    const trimmed = tresc.trim();
    if (!trimmed) return;

    const nowa: Notatka = {
      id: uuidv4(),
      tresc: trimmed,
      dataUtworzenia: new Date().toISOString(),
      dataWydarzenia: dataWydarzenia || undefined,
      autor: userName,
      miesiac,
      kanal,
    };
    onUpdate((prev) => [nowa, ...prev]);
    // Kanał "kierowca" → powiadomienie do kierowcy (akcja notatka_kierowca,
    // którą filtruje /api/driver/notifications). Wewnętrzne → zwykła notatka.
    logChange({
      workspaceId: token,
      userName,
      action: doKierowcy ? "notatka_kierowca" : "notatka",
      entity: "note",
      entityId: nowa.id,
      url: doKierowcy ? "/driver?tab=wiadomosci" : "/dashboard",
      description: doKierowcy
        ? `${userName} napisał do kierowcy: ${trimmed.slice(0, 60)}${trimmed.length > 60 ? "…" : ""}`
        : `${userName} dodał notatkę: ${trimmed.slice(0, 60)}${trimmed.length > 60 ? "…" : ""}`,
    });

    setTresc("");
    setDataWydarzenia("");
    setFormOpen(false);
  }

  function removeNotatka(id: string) {
    if (!window.confirm("Usunąć notatkę?")) return;
    onUpdate((prev) => prev.filter((n) => n.id !== id));
  }

  function startEdit(n: Notatka) {
    setEditingId(n.id);
    setEditText(n.tresc);
  }

  function saveEdit() {
    const trimmed = editText.trim();
    if (editingId && trimmed) {
      onUpdate((prev) =>
        prev.map((n) => (n.id === editingId ? { ...n, tresc: trimmed } : n))
      );
    }
    setEditingId(null);
  }

  return (
    <Card>
      {/* Nagłówek */}
      <div className="flex items-center gap-2 mb-3">
        <IconNotes size={18} className="text-amber-brand" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-dim flex-1">
          {doKierowcy ? "Wątek z kierowcą" : "Notatki wewnętrzne"}
        </h3>
        <button
          onClick={() => setFormOpen((v) => !v)}
          title="Dodaj notatkę"
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-amber-brand text-amber-ink hover:bg-[#e09420] transition-all duration-150"
        >
          <IconPlus size={16} />
        </button>
      </div>

      {/* Formularz nowej notatki */}
      {formOpen && (
        <div className="mb-3 space-y-2 rounded-xl bg-surface2 border border-line p-3 animate-fade-in">
          <textarea
            value={tresc}
            onChange={(e) => setTresc(e.target.value)}
            rows={3}
            autoFocus
            placeholder={doKierowcy ? "Wiadomość do kierowcy…" : "Treść notatki…"}
            className="w-full bg-input border border-line rounded-[10px] px-3 py-2 text-[15px] text-ink placeholder:text-dim/50 resize-y"
          />
          <div>
            <label className="block text-xs text-dim mb-1">
              Data wydarzenia / termin (opcjonalnie)
            </label>
            <input
              type="date"
              value={dataWydarzenia}
              onChange={(e) => setDataWydarzenia(e.target.value)}
              className="bg-input border border-line rounded-[10px] px-3 py-2 text-sm text-ink"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setFormOpen(false); setTresc(""); setDataWydarzenia(""); }}
              className="flex-1 py-2 min-h-[40px] rounded-xl bg-surface border border-line text-dim text-sm font-medium hover:text-ink transition-all duration-150"
            >
              Anuluj
            </button>
            <button
              onClick={addNotatka}
              disabled={!tresc.trim()}
              className="flex-1 py-2 min-h-[40px] rounded-xl bg-amber-brand text-amber-ink text-sm font-bold hover:bg-[#e09420] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
            >
              Dodaj notatkę
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {widoczne.length === 0 && !formOpen ? (
        <div className="py-6 text-center">
          <IconNotes size={32} className="text-dim/30 mx-auto mb-2" />
          <p className="text-sm text-dim/60">Brak notatek — dodaj pierwszą</p>
        </div>
      ) : (
        <div className="space-y-2">
          {widoczne.map((n) => (
            <div
              key={n.id}
              className="group rounded-xl bg-surface2 border border-line p-3"
            >
              {editingId === n.id ? (
                <textarea
                  value={editText}
                  autoFocus
                  rows={2}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="w-full bg-input border border-line rounded-[10px] px-2 py-1.5 text-sm text-ink resize-y"
                />
              ) : (
                <p
                  onClick={() => startEdit(n)}
                  title="Kliknij, aby edytować"
                  className="text-sm text-ink leading-snug whitespace-pre-wrap cursor-text"
                >
                  {n.tresc}
                </p>
              )}

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {n.dataWydarzenia && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-brand/10 border border-amber-brand/40 text-[11px] text-amber-brand tabular-nums">
                    <IconCalendar size={12} />
                    {formatDataPL(n.dataWydarzenia)}
                  </span>
                )}
                {n.odKierowcy && (
                  <span className="px-1.5 py-0.5 rounded-full bg-green-soft border border-green-500/40 text-[10px] text-green-300">
                    od kierowcy
                  </span>
                )}
                {doKierowcy && !n.odKierowcy && (
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded-full border text-[10px] font-semibold",
                      n.readByDriverAt
                        ? "bg-green-soft border-green-500/40 text-green-300"
                        : "bg-red-500/10 border-red-500/40 text-red-300"
                    )}
                    title={
                      n.readByDriverAt
                        ? `Przeczytane: ${formatCzas(n.readByDriverAt)}`
                        : "Kierowca jeszcze nie potwierdził przeczytania"
                    }
                  >
                    {n.readByDriverAt
                      ? `Przeczytane · ${formatCzas(n.readByDriverAt)}`
                      : "Nieprzeczytane"}
                  </span>
                )}
                {doKierowcy && !n.odKierowcy && (
                  <span className="px-1.5 py-0.5 rounded-full bg-surface border border-line text-[10px] text-dim">
                    do kierowcy
                  </span>
                )}
                {wszystkieMiesiace && (
                  <span className="px-1.5 py-0.5 rounded-full bg-surface border border-line text-[10px] text-dim">
                    {POLSKIE_MIESIACE[n.miesiac]}
                  </span>
                )}
                <span className={cn("text-[11px] text-dim/60 flex-1")}>
                  {n.autor} · {formatCzas(n.dataUtworzenia)}
                </span>
                <button
                  onClick={() => removeNotatka(n.id)}
                  title="Usuń notatkę"
                  className="shrink-0 p-1 rounded-lg text-dim/40 sm:opacity-0 sm:group-hover:opacity-100 hover:!text-red-400 hover:bg-red-soft transition-all duration-150"
                >
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
