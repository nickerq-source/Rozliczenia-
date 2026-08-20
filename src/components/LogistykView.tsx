"use client";

// Panel logistyka: jego rozliczenie miesiąc po miesiącu (12% ze zleceń +
// 5% z na-czysto + 600 za auta). Dane z /api/logistyk/rozliczenie. Read-only.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { formatZl } from "@/lib/business-logic";
import { POLSKIE_MIESIACE } from "@/lib/dates";
import { RozliczenieLogistyka } from "@/lib/logistyk";
import { Card } from "./ui/Card";
import { IconUsers, IconMoneybag, IconLoader, IconLock } from "./ui/icons";

const ddmm = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : iso);

export function LogistykView({ name }: { name: string }) {
  const router = useRouter();
  const [miesiace, setMiesiace] = useState<RozliczenieLogistyka[] | null>(null);
  const [razemOkres, setRazemOkres] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/logistyk/rozliczenie");
        if (!r.ok) throw new Error();
        const j = await r.json();
        setMiesiace(j.miesiace ?? []);
        setRazemOkres(j.razemOkres ?? 0);
      } catch {
        setError(true);
      }
    })();
  }, []);

  async function wyloguj() {
    await getBrowserSupabase().auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <IconUsers size={20} className="text-amber-brand" />
          <div>
            <p className="text-sm font-extrabold text-white">Logistyk</p>
            <p className="text-[11px] text-dim">{name}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={wyloguj}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-dim hover:text-ink"
        >
          Wyloguj
        </button>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-4">
        {/* Razem za okres */}
        <Card>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-brand/40 bg-amber-brand/10 text-amber-brand">
              <IconMoneybag size={20} />
            </span>
            <div className="flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-dim">Łącznie za dostępny okres</p>
              <p className="text-2xl font-extrabold tabular-nums text-amber-brand">{formatZl(razemOkres)}</p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-dim">
            12% z netto zleceń + 5% z „na czysto po PIT i zdrowotnej” + 600 zł za auta (3×200).
            Wyliczenia są szacunkowe — ostateczne rozliczenie potwierdza księgowa.
          </p>
        </Card>

        {error ? (
          <Card>
            <p className="text-sm text-red-300">Nie udało się wczytać rozliczenia. Odśwież stronę.</p>
          </Card>
        ) : miesiace === null ? (
          <Card>
            <p className="flex items-center gap-2 text-sm text-dim">
              <IconLoader size={15} /> Wczytuję rozliczenie…
            </p>
          </Card>
        ) : miesiace.length === 0 ? (
          <Card>
            <p className="text-sm text-dim">Brak rozliczeń w dostępnych miesiącach.</p>
          </Card>
        ) : (
          miesiace.map((m) => (
            <Card key={m.miesiac}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-white">
                  {POLSKIE_MIESIACE[m.miesiac]} 2026
                </h2>
                <span className="tabular-nums text-lg font-extrabold text-amber-brand">{formatZl(m.razem)}</span>
              </div>

              <div className="space-y-1 text-sm">
                <Wiersz label={`12% z netto zleceń (${formatZl(m.zleceniaNettoRazem)})`} value={m.prowizja12} />
                <Wiersz label={`5% z „na czysto” (${formatZl(m.naCzysto)})`} value={m.prowizja5} />
                <Wiersz label="Za auta (3 × 200 zł)" value={m.autaBonus} />
              </div>

              {/* Rozpisanie po autach */}
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {m.perAuto.map((a) => (
                  <div key={a.plate} className="rounded-xl border border-line bg-surface2 p-3">
                    <p className="text-sm font-bold text-white">{a.kierowca}</p>
                    <p className="text-[10px] uppercase tracking-wide text-dim">{a.plate}</p>
                    <div className="mt-2 space-y-0.5 text-[11px]">
                      <div className="flex justify-between"><span className="text-dim">Zleceń</span><span className="tabular-nums text-ink">{a.liczbaZlecen}</span></div>
                      <div className="flex justify-between"><span className="text-dim">Netto</span><span className="tabular-nums text-ink">{formatZl(a.zleceniaNetto)}</span></div>
                      <div className="flex justify-between"><span className="text-dim">Za auto</span><span className="tabular-nums text-green-300">{formatZl(a.bonus)}</span></div>
                      {a.automatyczne && <p className="mt-1 text-[10px] text-amber-brand">z faktur (auto)</p>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Lista zleceń ręcznych */}
              {m.zleceniaReczne.length > 0 && (
                <div className="mt-3 border-t border-line/60 pt-2">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-dim">Zlecenia</p>
                  <div className="divide-y divide-line/40">
                    {m.zleceniaReczne.map((z) => (
                      <div key={z.id} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
                        <span className="min-w-0 text-ink">
                          <span className="tabular-nums">{ddmm(z.data)}</span> · {z.kierowca}{" "}
                          <span className="text-dim">({z.plate})</span>
                          {z.opis ? <span className="text-dim"> · {z.opis}</span> : null}
                        </span>
                        <span className="shrink-0 tabular-nums font-bold text-white">{formatZl(z.wartoscNetto)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))
        )}

        <p className="flex items-center justify-center gap-1.5 py-2 text-[11px] text-dim/60">
          <IconLock size={12} /> Widzisz tylko swoje rozliczenie.
        </p>
      </main>
    </div>
  );
}

function Wiersz({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-dim">{label}</span>
      <span className="shrink-0 tabular-nums font-bold text-white">{formatZl(value)}</span>
    </div>
  );
}
