"use client";

// Panel logistyka: zakładki (Wszystko + miesiące od sierpnia), w każdej
// jego rozliczenie (12% ze zleceń + 5% z na-czysto + 600 za auta). Read-only.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { formatZl } from "@/lib/business-logic";
import { POLSKIE_MIESIACE, getDefaultMonth } from "@/lib/dates";
import { RozliczenieLogistyka } from "@/lib/logistyk";
import { MiesiącId } from "@/lib/types";
import { Card } from "./ui/Card";
import { IconUsers, IconMoneybag, IconLoader, IconLock } from "./ui/icons";
import { cn } from "@/lib/utils";

const ddmm = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : iso);
type Zakladka = "wszystko" | MiesiącId;

export function LogistykView({ name }: { name: string }) {
  const router = useRouter();
  const [miesiace, setMiesiace] = useState<RozliczenieLogistyka[] | null>(null);
  const [razemOkres, setRazemOkres] = useState(0);
  const [error, setError] = useState(false);
  const [aktywna, setAktywna] = useState<Zakladka>("wszystko");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/logistyk/rozliczenie");
        if (!r.ok) throw new Error();
        const j = await r.json();
        setMiesiace(j.miesiace ?? []);
        setRazemOkres(j.razemOkres ?? 0);
        // domyślnie aktualny miesiąc (jeśli jest na liście), inaczej ostatni z danymi
        const lista = (j.miesiace ?? []) as RozliczenieLogistyka[];
        const biezacy = getDefaultMonth();
        if (lista.some((m) => m.miesiac === biezacy)) setAktywna(biezacy);
        else if (lista.length) setAktywna(lista[lista.length - 1].miesiac);
      } catch {
        setError(true);
      }
    })();
  }, []);

  async function wyloguj() {
    await getBrowserSupabase().auth.signOut();
    router.push("/login");
  }

  const wybrany = useMemo(
    () => (aktywna === "wszystko" ? null : miesiace?.find((m) => m.miesiac === aktywna) ?? null),
    [aktywna, miesiace]
  );

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
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
        </div>

        {/* Zakładki: Wszystko + miesiące */}
        {miesiace && miesiace.length > 0 && (
          <div className="flex gap-1 overflow-x-auto px-4 pb-2 scrollbar-none">
            <TabBtn active={aktywna === "wszystko"} onClick={() => setAktywna("wszystko")}>Wszystko</TabBtn>
            {miesiace.map((m) => (
              <TabBtn key={m.miesiac} active={aktywna === m.miesiac} onClick={() => setAktywna(m.miesiac)}>
                {POLSKIE_MIESIACE[m.miesiac].slice(0, 3)}
              </TabBtn>
            ))}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-4">
        {error ? (
          <Card><p className="text-sm text-red-300">Nie udało się wczytać rozliczenia. Odśwież stronę.</p></Card>
        ) : miesiace === null ? (
          <Card><p className="flex items-center gap-2 text-sm text-dim"><IconLoader size={15} /> Wczytuję rozliczenie…</p></Card>
        ) : miesiace.length === 0 ? (
          <Card><p className="text-sm text-dim">Brak rozliczeń (logistyk rozliczany od sierpnia 2026).</p></Card>
        ) : aktywna === "wszystko" ? (
          <>
            {/* Razem za okres */}
            <Card>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-brand/40 bg-amber-brand/10 text-amber-brand">
                  <IconMoneybag size={20} />
                </span>
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-dim">Łącznie od sierpnia</p>
                  <p className="text-2xl font-extrabold tabular-nums text-amber-brand">{formatZl(razemOkres)}</p>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-dim">
                12% z netto zleceń + 5% z „na czysto po PIT i zdrowotnej” + 600 zł za auta (3×200).
                Wyliczenia szacunkowe — potwierdza księgowa.
              </p>
            </Card>

            {/* Skrót miesięcy — klik przechodzi do zakładki */}
            <Card>
              <div className="divide-y divide-line/50">
                {miesiace.map((m) => (
                  <button
                    key={m.miesiac}
                    type="button"
                    onClick={() => setAktywna(m.miesiac)}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:opacity-80"
                  >
                    <span className="text-sm font-bold text-white">{POLSKIE_MIESIACE[m.miesiac]} 2026</span>
                    <span className="tabular-nums text-base font-extrabold text-amber-brand">{formatZl(m.razem)}</span>
                  </button>
                ))}
              </div>
            </Card>
          </>
        ) : wybrany ? (
          <MiesiacCard m={wybrany} />
        ) : (
          <Card><p className="text-sm text-dim">Brak danych za ten miesiąc.</p></Card>
        )}

        <p className="flex items-center justify-center gap-1.5 py-2 text-[11px] text-dim/60">
          <IconLock size={12} /> Widzisz tylko swoje rozliczenie.
        </p>
      </main>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
        active ? "border-amber-brand bg-amber-brand text-amber-ink" : "border-line bg-surface2 text-dim hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

function MiesiacCard({ m }: { m: RozliczenieLogistyka }) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-white">{POLSKIE_MIESIACE[m.miesiac]} 2026</h2>
        <span className="tabular-nums text-lg font-extrabold text-amber-brand">{formatZl(m.razem)}</span>
      </div>

      <div className="space-y-1 text-sm">
        <Wiersz label={`12% z netto zleceń (${formatZl(m.zleceniaNettoRazem)})`} value={m.prowizja12} />
        <Wiersz label={`5% z „na czysto” (${formatZl(m.naCzysto)})`} value={m.prowizja5} />
        <Wiersz label="Za auta (3 × 200 zł)" value={m.autaBonus} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {m.perAuto.map((a) => (
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
