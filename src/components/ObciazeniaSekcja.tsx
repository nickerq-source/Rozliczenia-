"use client";

// Część D — obciążenia kierowcy (potrącenia z wypłaty).
// Admin: dodaje/usuwa (confirm + audit). Kierowca: tylko odczyt.

import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { DaneMiesiaca, Obciazenie } from "@/lib/types";
import { formatZlCaly, formatZl, sumaObciazen } from "@/lib/business-logic";
import { logChange } from "@/lib/audit";
import { POLSKIE_MIESIACE } from "@/lib/dates";
import { Card } from "./ui/Card";
import { NumInput } from "./ui/NumInput";
import { IconX, IconAlertTriangle } from "./ui/icons";

interface Props {
  miesiac: number;
  obciazenia: Obciazenie[];
  editable: boolean;
  // wymagane gdy editable
  onUpdate?: (updater: (prev: DaneMiesiaca) => DaneMiesiaca) => void;
  token?: string;
  userName?: string;
}

export function ObciazeniaSekcja({ miesiac, obciazenia, editable, onUpdate, token, userName }: Props) {
  const [nazwa, setNazwa] = useState("");
  const [kwota, setKwota] = useState(0);
  const [data, setData] = useState("");
  const [notatka, setNotatka] = useState("");

  const suma = sumaObciazen(obciazenia);

  function dodaj() {
    if (!onUpdate || !nazwa.trim() || kwota <= 0) return;
    const wpis: Obciazenie = {
      id: uuidv4(),
      data: data || undefined,
      nazwa: nazwa.trim(),
      kwota,
      notatka: notatka.trim() || undefined,
      autor: userName ?? "",
      utworzono: new Date().toISOString(),
    };
    onUpdate((prev) => ({ ...prev, obciazenia: [...(prev.obciazenia ?? []), wpis] }));
    logChange({
      workspaceId: token ?? "",
      userName: userName ?? "",
      action: "obciazenie_dodane",
      entity: "deduction",
      entityId: wpis.id,
      newValue: { nazwa: wpis.nazwa, kwota: wpis.kwota },
      description: `${userName} dodał obciążenie kierowcy ${POLSKIE_MIESIACE[miesiac]}: ${wpis.nazwa} ${formatZlCaly(wpis.kwota)}`,
      url: `/admin?miesiac=${miesiac}&zakladka=podsumowanie`,
    });
    setNazwa(""); setKwota(0); setData(""); setNotatka("");
  }

  function usun(o: Obciazenie) {
    if (!onUpdate) return;
    if (!window.confirm(`Usunąć obciążenie: ${o.nazwa} — ${formatZlCaly(o.kwota)}?\nTej operacji nie można cofnąć.`)) return;
    onUpdate((prev) => ({ ...prev, obciazenia: (prev.obciazenia ?? []).filter((x) => x.id !== o.id) }));
    logChange({
      workspaceId: token ?? "",
      userName: userName ?? "",
      action: "obciazenie_usuniete",
      entity: "deduction",
      entityId: o.id,
      oldValue: { nazwa: o.nazwa, kwota: o.kwota },
      description: `${userName} usunął obciążenie kierowcy: ${o.nazwa} ${formatZlCaly(o.kwota)}`,
    });
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <IconAlertTriangle size={16} className="text-red-300" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-dim flex-1">Obciążenia</h3>
        {suma > 0 && <span className="text-sm font-bold text-red-300 tabular-nums">− {formatZlCaly(suma)}</span>}
      </div>

      {obciazenia.length === 0 ? (
        <p className="text-xs text-dim/60 py-2">Brak obciążeń w tym miesiącu.</p>
      ) : (
        <div className="space-y-1.5">
          {obciazenia.map((o) => (
            <div key={o.id} className="flex items-start gap-2 rounded-lg bg-surface2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink leading-snug">
                  {o.nazwa}
                  {o.data && <span className="text-[11px] text-dim/60 ml-1.5">{o.data}</span>}
                </p>
                {o.notatka && <p className="text-[11px] text-dim/70 italic mt-0.5">„{o.notatka}”</p>}
              </div>
              <span className="shrink-0 text-sm font-bold text-red-300 tabular-nums">− {formatZl(o.kwota)}</span>
              {editable && (
                <button
                  onClick={() => usun(o)}
                  title="Usuń obciążenie"
                  className="shrink-0 p-1 rounded-lg text-dim hover:text-red-400 hover:bg-red-soft transition-colors"
                >
                  <IconX size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {editable && (
        <div className="mt-3 pt-3 border-t border-line grid grid-cols-2 gap-2">
          <input
            type="text"
            value={nazwa}
            onChange={(e) => setNazwa(e.target.value)}
            placeholder="np. Mandat z winy kierowcy"
            className="col-span-2 bg-input border border-line rounded-lg px-2.5 py-1.5 text-sm text-ink placeholder:text-dim/40"
          />
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="bg-input border border-line rounded-lg px-2.5 py-1.5 text-sm text-dim tabular-nums"
          />
          <div className="relative">
            <NumInput value={kwota} onChange={setKwota} placeholder="0" className="!py-1.5 !text-sm !pr-8" />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-dim pointer-events-none">zł</span>
          </div>
          <input
            type="text"
            value={notatka}
            onChange={(e) => setNotatka(e.target.value)}
            placeholder="Notatka (opcjonalnie)"
            className="col-span-2 bg-input border border-line rounded-lg px-2.5 py-1.5 text-sm text-ink placeholder:text-dim/40"
          />
          <button
            onClick={dodaj}
            disabled={!nazwa.trim() || kwota <= 0}
            className="col-span-2 py-2 rounded-xl bg-amber-brand text-amber-ink font-bold text-sm hover:bg-[#e09420] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Dodaj obciążenie
          </button>
        </div>
      )}
    </Card>
  );
}
