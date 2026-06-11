"use client";

// Widok kierowcy: „Moja wypłata" — rozbicie dzień po dniu z weryfikacją
// (zielony ptaszek = potwierdzam, czerwony X = zgłoś błąd z propozycją kółek).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { formatZlCaly } from "@/lib/business-logic";
import { Card } from "./ui/Card";
import {
  IconTruck,
  IconCheck,
  IconLoader,
  IconMoneybag,
  IconX,
  IconAlertTriangle,
  IconLock,
} from "./ui/icons";
import { cn } from "@/lib/utils";
import type { WeryfikacjaStatus } from "@/lib/types";

interface DzienRozbicie {
  data: string;
  nrDnia: number;
  skrotDnia: string;
  sobota: boolean;
  niedziela: boolean;
  kolka: number;
  szkolenie: number;
  dniowka: number;
  dodatekNiedzielny: number;
}

interface Zgloszenie {
  id: string;
  dzien: string;
  status: WeryfikacjaStatus;
  kolkaSystem: number;
  kolkaProponowane?: number;
  uwaga?: string;
  utworzono: string;
  rozwiazano?: string;
}

interface MiesiacWyplata {
  miesiac: number;
  nazwa: string;
  wynagrodzenie: number;
  dniPracy: number;
  kolka: number;
  liczbaSobot: number;
  premia: number;
  wyplata: { status: "niewypłacone" | "wypłacone"; paidAt?: string };
  zamkniety: boolean;
  dni: DzienRozbicie[];
  zgloszenia: Zgloszenie[];
}

function formatDataPL(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export function DriverView({ name }: { name: string }) {
  const router = useRouter();
  const [miesiace, setMiesiace] = useState<MiesiacWyplata[] | null>(null);
  const [error, setError] = useState(false);
  const [otwarty, setOtwarty] = useState<number | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/driver/payroll");
      if (!r.ok) throw new Error();
      const json = await r.json();
      setMiesiace(json.miesiace);
      setError(false);
      // Domyślnie otwórz pierwszy aktywny miesiąc
      setOtwarty((prev) => {
        if (prev !== null) return prev;
        const first = (json.miesiace as MiesiacWyplata[]).find((m) => m.wynagrodzenie > 0);
        return first ? first.miesiac : null;
      });
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    await getBrowserSupabase().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen relative text-ink">
      {/* Tło jak w panelu admina */}
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: "url('/papitrans-bg.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundAttachment: "fixed",
          filter: "saturate(1.35) contrast(1.08)",
        }}
        aria-hidden
      />
      <div className="fixed inset-0 z-0" style={{ background: "rgba(7, 12, 9, 0.80)" }} aria-hidden />

      <div className="relative z-[1]">
        <header
          className="sticky top-0 z-10 border-b border-line"
          style={{ background: "rgba(10, 15, 12, 0.92)", backdropFilter: "blur(12px)" }}
        >
          <div className="max-w-[480px] mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconTruck size={20} className="text-amber-brand" />
              <span className="logo-gem text-[19px]">PapiTrans</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-dim">{name}</span>
              <button
                onClick={logout}
                className="text-xs text-dim hover:text-ink border border-line rounded-lg px-2.5 py-1 transition-colors"
              >
                Wyloguj
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-[480px] mx-auto px-3 sm:px-6 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <IconMoneybag size={20} className="text-amber-brand" />
            <h1 className="text-lg font-bold text-white">Moja wypłata</h1>
          </div>
          <p className="text-xs text-dim -mt-1">
            Sprawdź każdy dzień. Zgadza się? Zaznacz{" "}
            <span className="text-green-400 font-semibold">✓</span>. Coś nie gra? Kliknij{" "}
            <span className="text-red-400 font-semibold">✗</span> i podaj poprawną liczbę kółek.
          </p>

          {error ? (
            <Card>
              <p className="text-sm text-red-300 mb-3">Nie udało się pobrać danych.</p>
              <button
                onClick={load}
                className="w-full py-2 rounded-xl bg-amber-brand text-amber-ink font-bold text-sm"
              >
                Spróbuj ponownie
              </button>
            </Card>
          ) : miesiace === null ? (
            <div className="flex items-center gap-2 text-dim text-sm py-8 justify-center">
              <IconLoader size={16} /> Ładowanie…
            </div>
          ) : (
            miesiace.map((m) => (
              <MiesiacKarta
                key={m.miesiac}
                m={m}
                otwarty={otwarty === m.miesiac}
                onToggle={() => setOtwarty((p) => (p === m.miesiac ? null : m.miesiac))}
                onZmiana={load}
              />
            ))
          )}
        </main>
      </div>
    </div>
  );
}

// ─── KARTA MIESIĄCA ───────────────────────────────────────────────────────────

function MiesiacKarta({
  m,
  otwarty,
  onToggle,
  onZmiana,
}: {
  m: MiesiacWyplata;
  otwarty: boolean;
  onToggle: () => void;
  onZmiana: () => void;
}) {
  const wyplacone = m.wyplata.status === "wypłacone";
  const aktywny = m.wynagrodzenie > 0;

  // Mapa zgłoszeń po dniu
  const zglMap = new Map(m.zgloszenia.map((z) => [z.dzien, z]));
  const doSprawdzenia = m.dni.filter((d) => {
    const z = zglMap.get(d.data);
    return !z || z.status === "odrzucony";
  }).length;

  return (
    <Card className={cn("overflow-hidden", !aktywny && "opacity-50")}>
      {/* Nagłówek — klik rozwija */}
      <button
        type="button"
        onClick={aktywny ? onToggle : undefined}
        className={cn("w-full flex items-center justify-between text-left", aktywny && "cursor-pointer")}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-white uppercase tracking-wide">{m.nazwa} 2026</h2>
          {m.zamkniety && <IconLock size={13} className="text-amber-brand" />}
        </div>
        {aktywny && (
          <span
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border",
              wyplacone
                ? "bg-green-soft border-green-500/40 text-green-300"
                : "bg-surface2 border-line text-dim"
            )}
          >
            {wyplacone ? <IconCheck size={12} /> : <span className="w-1.5 h-1.5 rounded-full bg-amber-brand" />}
            {wyplacone
              ? `Wypłacone${m.wyplata.paidAt ? ` (${formatDataPL(m.wyplata.paidAt)})` : ""}`
              : "Niewypłacone"}
          </span>
        )}
      </button>

      <p className="text-2xl font-extrabold text-amber-brand tabular-nums mt-1">
        {formatZlCaly(m.wynagrodzenie)}
      </p>

      {aktywny && (
        <p className="text-xs text-dim mt-0.5">
          {m.dniPracy} dni pracy · {m.kolka} kółek · soboty {m.liczbaSobot}/4
          {m.premia > 0 && <span className="text-amber-brand"> · premia +{formatZlCaly(m.premia)}</span>}
        </p>
      )}

      {/* Przypomnienie o weryfikacji */}
      {aktywny && doSprawdzenia > 0 && (
        <button
          type="button"
          onClick={onToggle}
          className="mt-2 flex items-center gap-1.5 text-xs text-amber-brand"
        >
          <IconAlertTriangle size={13} />
          {doSprawdzenia} {doSprawdzenia === 1 ? "dzień do sprawdzenia" : "dni do sprawdzenia"}
        </button>
      )}

      {/* Rozbicie dni */}
      {aktywny && otwarty && (
        <div className="mt-3 pt-3 border-t border-line space-y-1.5">
          {m.dni.map((d) => (
            <DzienWiersz
              key={d.data}
              miesiac={m.miesiac}
              d={d}
              zgloszenie={zglMap.get(d.data)}
              readonly={m.zamkniety}
              onZmiana={onZmiana}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── WIERSZ DNIA ──────────────────────────────────────────────────────────────

function DzienWiersz({
  miesiac,
  d,
  zgloszenie,
  readonly,
  onZmiana,
}: {
  miesiac: number;
  d: DzienRozbicie;
  zgloszenie?: Zgloszenie;
  readonly: boolean;
  onZmiana: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [zglaszam, setZglaszam] = useState(false);
  const [propozycja, setPropozycja] = useState<string>(String(d.kolka));
  const [uwaga, setUwaga] = useState("");

  async function wyslij(akcja: "akceptuj" | "zglos") {
    setBusy(true);
    try {
      const res = await fetch("/api/driver/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          miesiac,
          dzien: d.data,
          akcja,
          kolkaProponowane: akcja === "zglos" ? Number(propozycja) : undefined,
          uwaga: akcja === "zglos" ? uwaga : undefined,
        }),
      });
      if (res.ok) {
        setZglaszam(false);
        setUwaga("");
        onZmiana();
      }
    } finally {
      setBusy(false);
    }
  }

  const st = zgloszenie?.status;
  const tlo = d.sobota
    ? "var(--sat-bg)"
    : d.niedziela
    ? "var(--sun-bg)"
    : undefined;

  return (
    <div className="rounded-xl px-2.5 py-2" style={{ background: tlo ?? "var(--surface-2, rgba(255,255,255,0.02))" }}>
      <div className="flex items-center gap-2">
        {/* Data */}
        <div className="w-12 shrink-0 tabular-nums">
          <span className="font-bold text-white text-sm">{d.nrDnia}</span>
          <span
            className={cn(
              "ml-1 text-[11px]",
              d.sobota ? "text-green-300" : d.niedziela ? "text-yellow-300" : "text-dim"
            )}
          >
            {d.skrotDnia}
          </span>
        </div>

        {/* Kółka + dniówka */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-ink">
            <span className="font-semibold text-white">{d.kolka}</span> kółek
            {d.dodatekNiedzielny > 0 && (
              <span className="text-yellow-300 text-xs"> · +niedziela</span>
            )}
            {d.szkolenie > 0 && <span className="text-blue-300 text-xs"> · szkolenie</span>}
          </p>
        </div>

        {/* Kwota */}
        <span className="shrink-0 text-sm font-bold text-amber-brand tabular-nums">
          {formatZlCaly(d.dniowka)}
        </span>

        {/* Akcje / status */}
        {!readonly && (
          <div className="shrink-0 flex items-center gap-1">
            {st === "zaakceptowany" ? (
              <span title="Potwierdzone przez Ciebie" className="text-green-400">
                <IconCheck size={18} />
              </span>
            ) : st === "zgloszony" ? (
              <span className="text-[11px] text-amber-brand font-medium px-2 py-0.5 rounded-full bg-amber-brand/10 border border-amber-brand/30">
                czeka
              </span>
            ) : st === "przyjety" ? (
              <span title="Poprawione" className="text-green-400 flex items-center gap-0.5 text-[11px]">
                <IconCheck size={14} /> ok
              </span>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => wyslij("akceptuj")}
                  title="Wszystko się zgadza"
                  className="p-1.5 rounded-lg text-green-400 hover:bg-green-soft transition-colors disabled:opacity-40"
                >
                  <IconCheck size={18} />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setZglaszam((v) => !v)}
                  title="Zgłoś błąd"
                  className="p-1.5 rounded-lg text-red-400 hover:bg-red-soft transition-colors disabled:opacity-40"
                >
                  <IconX size={18} />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Status odrzucenia */}
      {st === "odrzucony" && (
        <p className="mt-1 text-[11px] text-red-300/80">
          Twoje zgłoszenie zostało odrzucone przez biuro.
        </p>
      )}
      {st === "zgloszony" && zgloszenie?.kolkaProponowane !== undefined && (
        <p className="mt-1 text-[11px] text-amber-brand/90">
          Zgłoszono: {zgloszenie.kolkaSystem} → {zgloszenie.kolkaProponowane} kółek
          {zgloszenie.uwaga ? ` — „${zgloszenie.uwaga}”` : ""}
        </p>
      )}

      {/* Formularz zgłoszenia */}
      {zglaszam && (
        <div className="mt-2 pt-2 border-t border-line/60 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-dim">Powinno być kółek:</label>
            <input
              type="number"
              min={0}
              value={propozycja}
              onChange={(e) => setPropozycja(e.target.value)}
              className="w-16 bg-input border border-line rounded-lg px-2 py-1 text-sm text-center text-ink tabular-nums"
            />
          </div>
          <input
            type="text"
            value={uwaga}
            onChange={(e) => setUwaga(e.target.value)}
            placeholder="Komentarz (opcjonalnie)…"
            className="w-full bg-input border border-line rounded-lg px-2.5 py-1.5 text-sm text-ink placeholder:text-dim/40"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => wyslij("zglos")}
              className="flex-1 py-1.5 rounded-lg bg-red-500/90 hover:bg-red-500 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {busy ? <IconLoader size={13} /> : <IconAlertTriangle size={13} />}
              Wyślij zgłoszenie
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setZglaszam(false)}
              className="px-3 py-1.5 rounded-lg border border-line text-dim text-xs hover:text-ink"
            >
              Anuluj
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
