"use client";

// Zakładka „Zlecenia" (admin) — wpisywanie zleceń (data, auto/kierowca, netto)
// oraz rozliczenie logistyka za miesiąc: 12% z netto zleceń + 5% z „na czysto"
// + 600 zł za auta. Zlecenia Żeni doklejają się automatycznie z faktur.

import { useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { DaneMiesiaca, MiesiącId, WorkspaceData, LOGISTYK_AUTA } from "@/lib/types";
import { obliczLogistyka, LOGISTYK_START_MONTH } from "@/lib/logistyk";
import { formatZl, formatZlCaly, parseNum } from "@/lib/business-logic";
import { POLSKIE_MIESIACE } from "@/lib/dates";
import { logChange } from "@/lib/audit";
import { NumInput } from "../ui/NumInput";
import { Card, CardTitle } from "../ui/Card";
import { IconPackage, IconUsers, IconX, IconPlus } from "../ui/icons";
import { cn } from "@/lib/utils";

function todayInMonth(miesiac: MiesiącId): string {
  const now = new Date();
  if (now.getFullYear() === 2026 && now.getMonth() + 1 === miesiac) {
    return `2026-${String(miesiac).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  return `2026-${String(miesiac).padStart(2, "0")}-01`;
}

const ddmm = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : iso);

export function ZleceniaTab({
  miesiac,
  data,
  onUpdate,
  token,
  userName,
}: {
  miesiac: MiesiącId;
  data: WorkspaceData;
  onUpdate: (updater: (prev: DaneMiesiaca) => DaneMiesiaca) => void;
  token: string;
  userName: string;
}) {
  const [fData, setFData] = useState(todayInMonth(miesiac));
  const [fPlate, setFPlate] = useState(LOGISTYK_AUTA[0].plate);
  const [fNetto, setFNetto] = useState<number>(0);
  const [fOpis, setFOpis] = useState("");

  const dane = data.miesiace?.[miesiac];
  const reczne = dane?.zleceniaLog ?? [];
  const rozliczenie = useMemo(() => obliczLogistyka(data, miesiac), [data, miesiac]);

  function dodaj() {
    if (fNetto <= 0) return;
    const auto = LOGISTYK_AUTA.find((a) => a.plate === fPlate) ?? LOGISTYK_AUTA[0];
    const wpis = {
      id: uuidv4(),
      data: fData,
      plate: auto.plate,
      kierowca: auto.kierowca,
      wartoscNetto: parseNum(fNetto),
      opis: fOpis.trim() || undefined,
      dodanyBy: userName,
      createdAt: new Date().toISOString(),
    };
    onUpdate((prev) => ({ ...prev, zleceniaLog: [...(prev.zleceniaLog ?? []), wpis] }));
    logChange({
      workspaceId: token,
      userName,
      action: "zlecenie_dodane",
      entity: "zlecenie",
      entityId: wpis.id,
      newValue: { plate: wpis.plate, kierowca: wpis.kierowca, netto: wpis.wartoscNetto },
      description: `${userName} dodał zlecenie: ${auto.kierowca} (${auto.plate}) ${formatZlCaly(wpis.wartoscNetto)} netto`,
      url: `/admin?miesiac=${miesiac}&zakladka=zlecenia`,
    });
    setFNetto(0);
    setFOpis("");
  }

  function usun(id: string) {
    onUpdate((prev) => ({ ...prev, zleceniaLog: (prev.zleceniaLog ?? []).filter((z) => z.id !== id) }));
    logChange({
      workspaceId: token,
      userName,
      action: "zlecenie_usuniete",
      entity: "zlecenie",
      entityId: id,
      description: `${userName} usunął zlecenie`,
      url: `/admin?miesiac=${miesiac}&zakladka=zlecenia`,
    });
  }

  const inputCls = "w-full rounded-lg border border-line bg-input px-3 py-2 text-sm text-ink placeholder:text-dim/40";

  return (
    <div className="space-y-4">
      {/* Rozliczenie logistyka */}
      <Card>
        <div className="mb-3 flex items-start gap-2">
          <IconUsers size={18} className="mt-0.5 text-amber-brand" />
          <div className="min-w-0 flex-1">
            <CardTitle className="mb-1">Rozliczenie logistyka — {POLSKIE_MIESIACE[miesiac]} 2026</CardTitle>
            <p className="text-[11px] text-dim">
              12% z netto zleceń + 5% z „na czysto po PIT i zdrowotnej” + 600 zł za auta (3×200).
              Zlecenia Żeni liczone automatycznie z faktur. Szacunkowo — potwierdza księgowa.
            </p>
          </div>
        </div>

        {miesiac < LOGISTYK_START_MONTH ? (
          <p className="rounded-xl border border-amber-brand/35 bg-amber-brand/10 px-3 py-3 text-sm text-amber-brand">
            Logistyk jest rozliczany dopiero od sierpnia 2026 — ten miesiąc nie wchodzi do jego wynagrodzenia.
            Zlecenia możesz wpisywać, ale nie liczą się do prowizji.
          </p>
        ) : (
        <div className="space-y-1">
          <Wiersz label={`12% z netto zleceń (${formatZl(rozliczenie.zleceniaNettoRazem)})`} value={rozliczenie.prowizja12} />
          <Wiersz label={`5% z „na czysto" (${formatZl(rozliczenie.naCzysto)})`} value={rozliczenie.prowizja5} />
          <Wiersz label="Za auta (3 × 200 zł)" value={rozliczenie.autaBonus} />
          <div className="flex items-center justify-between border-t border-line pt-2 text-base font-extrabold">
            <span className="text-white">Razem dla logistyka</span>
            <span className="tabular-nums text-amber-brand">{formatZl(rozliczenie.razem)}</span>
          </div>
        </div>
        )}

        {/* Rozpisanie po autach */}
        {miesiac >= LOGISTYK_START_MONTH && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {rozliczenie.perAuto.map((a) => (
            <div key={a.plate} className="rounded-xl border border-line bg-surface2 p-3">
              <p className="text-sm font-bold text-white">{a.kierowca}</p>
              <p className="text-[10px] uppercase tracking-wide text-dim">{a.plate}</p>
              <div className="mt-2 space-y-0.5 text-[11px]">
                <div className="flex justify-between"><span className="text-dim">Zleceń</span><span className="tabular-nums text-ink">{a.liczbaZlecen}</span></div>
                <div className="flex justify-between"><span className="text-dim">Netto zleceń</span><span className="tabular-nums text-ink">{formatZl(a.zleceniaNetto)}</span></div>
                <div className="flex justify-between"><span className="text-dim">12% ze zleceń</span><span className="tabular-nums text-ink">{formatZl(a.prowizja12)}</span></div>
                <div className="flex justify-between"><span className="text-dim">Za auto</span><span className="tabular-nums text-green-300">{formatZl(a.bonus)}</span></div>
                {a.prowizja5 > 0 && (
                  <div className="flex justify-between"><span className="text-dim">5% z „na czysto”</span><span className="tabular-nums text-ink">{formatZl(a.prowizja5)}</span></div>
                )}
                <div className="flex justify-between border-t border-line/60 pt-1 font-bold"><span className="text-white">Łącznie za auto</span><span className="tabular-nums text-amber-brand">{formatZl(a.lacznie)}</span></div>
                {a.automatyczne && <p className="text-[10px] text-amber-brand">kierowca · zlecenia z faktur</p>}
              </div>
            </div>
          ))}
        </div>
        )}
      </Card>

      {/* Dodawanie zlecenia */}
      <Card>
        <CardTitle className="mb-3">Dodaj zlecenie</CardTitle>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] font-semibold text-dim">
            Data
            <input type="date" value={fData} onChange={(e) => setFData(e.target.value)} className={inputCls} />
          </label>
          <label className="text-[11px] font-semibold text-dim">
            Auto / kierowca
            <select value={fPlate} onChange={(e) => setFPlate(e.target.value)} className={inputCls}>
              {LOGISTYK_AUTA.map((a) => (
                <option key={a.plate} value={a.plate}>{a.kierowca} — {a.plate}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-dim">
            Wartość netto
            <NumInput value={fNetto} onChange={setFNetto} placeholder="0,00" className="mt-0.5 !text-left" />
          </label>
          <label className="text-[11px] font-semibold text-dim">
            Opis (opcjonalnie)
            <input value={fOpis} onChange={(e) => setFOpis(e.target.value)} placeholder="np. przewóz…" className={inputCls} />
          </label>
        </div>
        <button
          type="button"
          onClick={dodaj}
          disabled={fNetto <= 0}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-brand py-2.5 text-sm font-bold text-amber-ink hover:bg-[#e09420] disabled:opacity-40"
        >
          <IconPlus size={15} /> Dodaj zlecenie
        </button>
      </Card>

      {/* Lista zleceń ręcznych */}
      <Card>
        <div className="mb-2 flex items-center gap-2">
          <IconPackage size={18} className="text-amber-brand" />
          <CardTitle className="mb-0">Zlecenia miesiąca ({reczne.length})</CardTitle>
        </div>
        {reczne.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface2/60 px-3 py-6 text-center text-sm text-dim">
            Brak ręcznych zleceń w tym miesiącu. Zlecenia Żeni liczą się osobno z faktur.
          </p>
        ) : (
          <div className="divide-y divide-line/50">
            {reczne.map((z) => (
              <div key={z.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <span className="tabular-nums">{ddmm(z.data)}</span> · {z.kierowca} <span className="text-dim">({z.plate})</span>
                    {z.opis ? <span className="text-dim"> · {z.opis}</span> : null}
                  </p>
                  {z.dodanyBy ? <p className="text-[10px] text-dim/60">wpisał: {z.dodanyBy}</p> : null}
                </div>
                <span className="shrink-0 tabular-nums text-sm font-bold text-white">{formatZl(z.wartoscNetto)}</span>
                <button
                  type="button"
                  onClick={() => usun(z.id)}
                  title="Usuń"
                  className="shrink-0 rounded-lg p-2 text-red-400 hover:bg-red-soft"
                >
                  <IconX size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Wiersz({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="text-dim">{label}</span>
      <span className={cn("shrink-0 tabular-nums font-bold text-white")}>{formatZl(value)}</span>
    </div>
  );
}
