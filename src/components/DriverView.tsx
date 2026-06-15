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
  IconGasStation,
  IconBell,
  IconX,
  IconAlertTriangle,
  IconLock,
} from "./ui/icons";
import { cn } from "@/lib/utils";
import type { WeryfikacjaStatus, DayType } from "@/lib/types";
import { typDniaMeta, czyWolny, maKolka, maZlecenia } from "@/lib/day-type";
import { TankowanieKierowcy } from "./TankowanieKierowcy";
import { WiadomosciKierowcy } from "./WiadomosciKierowcy";
import { PowiadomieniaKierowcy } from "./PowiadomieniaKierowcy";

interface DzienRozbicie {
  data: string;
  nrDnia: number;
  skrotDnia: string;
  sobota: boolean;
  niedziela: boolean;
  dayType: DayType;
  kolka: number;
  szkolenie: number;
  zlecenia: number;
  stawkaZlecenia: number;
  kwotaZlecen: number;
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

interface Obciazenie {
  id: string;
  data?: string;
  nazwa: string;
  kwota: number;
  notatka?: string;
}

interface MiesiacWyplata {
  miesiac: number;
  nazwa: string;
  wynagrodzenie: number;
  sumaDniowek: number;
  premia: number;
  obciazeniaSuma: number;
  doWyplaty: number;
  dniPracy: number;
  kolka: number;
  liczbaSobot: number;
  wolneBezplatneRobocze: number;
  dodatkiZablokowaneOdLipca: boolean;
  liczbyDni: { pracujace: number; wolne: number; urlop: number; chorobowe: number };
  wyplata: { status: "niewypłacone" | "wypłacone"; paidAt?: string };
  zamkniety: boolean;
  dni: DzienRozbicie[];
  obciazenia: Obciazenie[];
  zgloszenia: Zgloszenie[];
}

type DriverKategoria = "wyplata" | "tankowanie" | "wiadomosci" | "legenda";

function formatDataPL(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function opisKategorii(kategoria: DriverKategoria): string {
  if (kategoria === "tankowanie") return "Dodaj tankowanie, zdjęcie licznika i paragon.";
  if (kategoria === "wiadomosci") return "Powiadomienia, notatki i kontakt z biurem.";
  if (kategoria === "legenda") return "Stawki, premie i zasady naliczania wypłaty.";
  return "Sprawdź dni pracy, kółka, zlecenia i zgłoś poprawki.";
}

export function DriverView({ name }: { name: string }) {
  const router = useRouter();
  const [miesiace, setMiesiace] = useState<MiesiacWyplata[] | null>(null);
  const [error, setError] = useState(false);
  const [otwarty, setOtwarty] = useState<number | null>(null);
  const [kategoria, setKategoria] = useState<DriverKategoria>("wyplata");

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
          <div className="max-w-[480px] mx-auto px-3 sm:px-6 pt-2">
            <div className="flex items-center justify-between mb-2">
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
            <KategorieKierowcy active={kategoria} onChange={setKategoria} />
          </div>
        </header>

        <main className="max-w-[480px] mx-auto px-3 sm:px-6 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <IkonaKategorii kategoria={kategoria} size={20} className="text-amber-brand" />
            <h1 className="text-lg font-bold text-white">
              {kategoria === "wyplata" && "Wypłata"}
              {kategoria === "tankowanie" && "Tankowanie"}
              {kategoria === "wiadomosci" && "Wiadomości"}
              {kategoria === "legenda" && "Legenda stawek i zasad"}
            </h1>
          </div>
          <p className="text-xs text-dim -mt-1">{opisKategorii(kategoria)}</p>

          {kategoria === "wyplata" && (
            <>
              <p className="text-xs text-dim">
                Zgadza się? Zaznacz <span className="text-green-400 font-semibold">✓</span>.
                Coś nie gra? Kliknij <span className="text-red-400 font-semibold">✗</span>{" "}
                i podaj poprawną liczbę kółek.
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
            </>
          )}

          {kategoria === "tankowanie" && <TankowanieKierowcy />}

          {kategoria === "wiadomosci" && (
            <>
              <PowiadomieniaKierowcy />
              <WiadomosciKierowcy />
            </>
          )}

          {kategoria === "legenda" && <LegendaWyplaty />}
        </main>
      </div>
    </div>
  );
}

function IkonaKategorii({
  kategoria,
  size,
  className,
}: {
  kategoria: DriverKategoria;
  size?: number;
  className?: string;
}) {
  if (kategoria === "tankowanie") return <IconGasStation size={size} className={className} />;
  if (kategoria === "wiadomosci") return <IconBell size={size} className={className} />;
  return <IconMoneybag size={size} className={className} />;
}

function KategorieKierowcy({
  active,
  onChange,
}: {
  active: DriverKategoria;
  onChange: (kategoria: DriverKategoria) => void;
}) {
  const items: Array<{ id: DriverKategoria; label: string; short: string }> = [
    { id: "wyplata", label: "Wypłata", short: "Wypłata" },
    { id: "tankowanie", label: "Tankowanie", short: "Tank." },
    { id: "wiadomosci", label: "Wiadomości", short: "Wiad." },
    { id: "legenda", label: "Legenda", short: "Zasady" },
  ];

  return (
    <div className="flex w-full">
      {items.map((item) => {
        const selected = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "flex-1 min-h-[40px] border-b-2 -mb-px px-1 py-2 text-[12px] font-medium transition-all duration-150",
              selected
                ? "border-amber-brand text-white font-bold"
                : "border-transparent text-dim hover:text-ink"
            )}
          >
            <span className="hidden min-[390px]:inline">{item.label}</span>
            <span className="min-[390px]:hidden">{item.short}</span>
          </button>
        );
      })}
    </div>
  );
}

function LegendaWyplaty() {
  return (
    <Card className="!p-4 border-amber-brand/25 bg-surface/90">
      <div className="flex items-center gap-2 mb-2">
        <IconMoneybag size={16} className="text-amber-brand" />
        <p className="text-xs font-extrabold uppercase tracking-wider text-amber-brand">
          Legenda wypłaty kierowcy
        </p>
      </div>
      <div className="space-y-3 text-xs leading-relaxed text-dim">
        <p>
          <b className="text-white">Kółko — 100 zł</b>
          <br />
          Każde zaliczone kółko/trasa jest liczone po 100 zł.
        </p>
        <p>
          <b className="text-white">Zlecenie — 50–100 zł albo cena indywidualna</b>
          <br />
          Zlecenia dodatkowe są liczone według stawki 50–100 zł albo według ceny
          indywidualnej wpisanej przez biuro.
        </p>
        <p>
          <b className="text-white">Premia sobotnia — +200 zł</b>
          <br />
          Premia przysługuje za przepracowanie 4 sobót w danym miesiącu.
        </p>
        <p>
          <b className="text-white">Warunek premii sobotniej:</b>
          <br />
          Kierowca musi zachować ciągłość pracy w miesiącu. Urlop oraz L4 nie przerywają
          ciągłości pracy.
          <br />
          Przykład: kierowca bierze urlop w środę, ale pracuje 4 soboty — premia sobotnia
          nadal przysługuje.
        </p>
        <p>
          Wolne bezpłatne od poniedziałku do piątku może wpłynąć na dodatki według zasad
          obowiązujących od lipca.
        </p>
        <p>
          <b className="text-white">Sobota + niedziela — normalna kasa + dodatek 250 zł</b>
          <br />
          Jeżeli kierowca pracuje w sobotę i niedzielę, otrzymuje normalną kasę za wykonane
          kółka i zlecenia oraz dodatkowo +250 zł.
        </p>
        <p className="rounded-xl border border-amber-brand/30 bg-amber-brand/10 px-3 py-2.5 text-amber-brand">
          <b>Warunek dodatku 250 zł od lipca:</b>
          <br />
          Dodatek 250 zł za sobotę + niedzielę przysługuje tylko wtedy, gdy kierowca nie ma
          w danym miesiącu 2 dni wolnego bezpłatnego w dni robocze, czyli od poniedziałku
          do piątku.
          <br />
          <br />
          Jeżeli w danym miesiącu kierowca ma 2 dni wolnego bezpłatnego od poniedziałku
          do piątku, dodatek 250 zł za sobotę + niedzielę nie przysługuje.
        </p>
        <p>
          <b className="text-white">Soboty nie liczą się do limitu wolnego bezpłatnego.</b>
          <br />
          Do limitu liczymy tylko dni robocze od poniedziałku do piątku.
        </p>
        <p>
          <b className="text-white">Dwie soboty w miesiącu są obowiązkowe.</b>
          <br />
          Pozostałe soboty nie są traktowane jako wolne bezpłatne.
        </p>
      </div>
    </Card>
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
        {formatZlCaly(m.doWyplaty)}
      </p>
      {aktywny && m.obciazeniaSuma > 0 && (
        <p className="text-[11px] text-dim mt-0.5">
          zarobek {formatZlCaly(m.wynagrodzenie)} − obciążenia {formatZlCaly(m.obciazeniaSuma)}
        </p>
      )}

      {aktywny && (
        <p className="text-xs text-dim mt-0.5">
          {m.dniPracy} dni pracy · {m.kolka} kółek · soboty {m.liczbaSobot}/4
          {m.premia > 0 && <span className="text-amber-brand"> · premia +{formatZlCaly(m.premia)}</span>}
        </p>
      )}

      {aktywny && m.miesiac >= 7 && (
        <p
          className={cn(
            "text-[11px] mt-1 flex items-center gap-1.5",
            m.dodatkiZablokowaneOdLipca ? "text-red-300" : "text-dim"
          )}
        >
          {m.dodatkiZablokowaneOdLipca && <IconAlertTriangle size={12} />}
          Wolne bezpłatne Pon–Pt:{" "}
          <b className={m.dodatkiZablokowaneOdLipca ? "text-red-200" : "text-ink"}>
            {m.wolneBezplatneRobocze}/2
          </b>
          {m.dodatkiZablokowaneOdLipca && " — premia i dodatki niedzielne zablokowane"}
        </p>
      )}

      {aktywny && (m.liczbyDni.wolne + m.liczbyDni.urlop + m.liczbyDni.chorobowe) > 0 && (
        <p className="text-[11px] text-dim mt-0.5 flex flex-wrap gap-x-2.5">
          <span>Pracujące: <b className="text-ink">{m.liczbyDni.pracujace}</b></span>
          {m.liczbyDni.wolne > 0 && <span>Wolne: <b className="text-zinc-300">{m.liczbyDni.wolne}</b></span>}
          {m.liczbyDni.urlop > 0 && <span>Urlop: <b className="text-blue-300">{m.liczbyDni.urlop}</b></span>}
          {m.liczbyDni.chorobowe > 0 && <span>L4: <b className="text-purple-300">{m.liczbyDni.chorobowe}</b></span>}
        </p>
      )}

      {aktywny && (
        <a
          href={`/api/payroll-pdf/${m.miesiac}`}
          className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-brand border border-amber-brand/40 rounded-lg px-2.5 py-1 hover:bg-amber-brand/10 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          📄 Pobierz PDF wypłaty
        </a>
      )}

      {/* Rozliczenie wypłaty (z obciążeniami) — widoczne po rozwinięciu */}
      {aktywny && otwarty && (
        <div className="mt-3 rounded-xl bg-surface2 border border-line p-3 text-sm tabular-nums">
          <p className="text-[11px] font-bold uppercase tracking-wider text-dim mb-2">Rozliczenie wypłaty</p>
          <div className="flex justify-between py-0.5">
            <span className="text-dim">Zarobek z kółek + dodatki</span>
            <span className="text-ink">{formatZlCaly(m.sumaDniowek)}</span>
          </div>
          {m.premia > 0 && (
            <div className="flex justify-between py-0.5">
              <span className="text-dim">Premia sobotnia</span>
              <span className="text-amber-brand">+ {formatZlCaly(m.premia)}</span>
            </div>
          )}
          {m.dodatkiZablokowaneOdLipca && (
            <div className="mt-2 rounded-lg border border-red-500/35 bg-red-soft px-2.5 py-2 text-xs text-red-200">
              Premia sobotnia 200 zł i dodatki niedzielne 250 zł nie są doliczone,
              bo w tym miesiącu są co najmniej 2 dni wolnego bezpłatnego od poniedziałku do piątku.
            </div>
          )}

          {/* Obciążenia */}
          <div className="mt-1.5 pt-1.5 border-t border-line">
            <p className="text-[11px] font-bold uppercase tracking-wider text-dim mb-1">Obciążenia</p>
            {m.obciazenia.length === 0 ? (
              <p className="text-xs text-dim/60">Brak obciążeń w tym miesiącu.</p>
            ) : (
              m.obciazenia.map((o) => (
                <div key={o.id} className="flex items-start justify-between gap-2 text-xs py-0.5">
                  <span className="text-ink min-w-0">
                    {o.nazwa}
                    {o.data && <span className="text-dim/50 ml-1">{o.data}</span>}
                    {o.notatka && <span className="block text-dim/60 italic">„{o.notatka}”</span>}
                  </span>
                  <span className="shrink-0 text-red-300 font-semibold tabular-nums">− {formatZlCaly(o.kwota)}</span>
                </div>
              ))
            )}
          </div>

          <div className="flex justify-between font-bold pt-2 mt-1.5 border-t border-line">
            <span className="text-white">Do wypłaty</span>
            <span className="text-white text-base">{formatZlCaly(m.doWyplaty)}</span>
          </div>
        </div>
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
  const wolny = czyWolny(d.dayType);
  const dzienMaKolka = maKolka(d.dayType);
  const dzienMaZlecenia = maZlecenia(d.dayType);
  const meta = typDniaMeta(d.dayType);
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

        {/* Kółka + dniówka / typ dnia */}
        <div className="flex-1 min-w-0">
          {wolny ? (
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold", meta.chipCls)}>
              {meta.label}
            </span>
          ) : (
            <p className="text-sm text-ink">
              {dzienMaKolka && (
                <><span className="font-semibold text-white">{d.kolka}</span> kółek</>
              )}
              {dzienMaZlecenia && d.zlecenia > 0 && (
                <span className="text-amber-brand text-xs">
                  {dzienMaKolka ? " · " : ""}{d.zlecenia} zlec. × {formatZlCaly(d.stawkaZlecenia)}
                </span>
              )}
              {d.dodatekNiedzielny > 0 && (
                <span className="text-yellow-300 text-xs"> · +niedziela</span>
              )}
              {d.szkolenie > 0 && <span className="text-blue-300 text-xs"> · szkolenie</span>}
            </p>
          )}
        </div>

        {/* Kwota */}
        {!wolny && (
          <span className="shrink-0 text-sm font-bold text-amber-brand tabular-nums">
            {formatZlCaly(d.dniowka)}
          </span>
        )}

        {/* Akcje / status — także dla dni wolnych (kierowca może je zakwestionować) */}
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
                  title={wolny ? `Tak, ${meta.label} się zgadza` : "Wszystko się zgadza"}
                  className="p-1.5 rounded-lg text-green-400 hover:bg-green-soft transition-colors disabled:opacity-40"
                >
                  <IconCheck size={18} />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setZglaszam((v) => !v)}
                  title={wolny ? "Pracowałem tego dnia — zgłoś" : "Zgłoś błąd"}
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
          {wolny && (
            <p className="text-[11px] text-amber-brand/90">
              Ten dzień jest oznaczony jako {meta.label}. Jeśli pracowałeś — podaj liczbę kółek.
            </p>
          )}
          <div className="flex items-center gap-2">
            <label className="text-xs text-dim">{wolny ? "Pracowałem — kółek:" : "Powinno być kółek:"}</label>
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
