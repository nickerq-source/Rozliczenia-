"use client";

// Zakładka Koszty — sekcje: Dni kierowcy, Tankowanie, Inne koszty, Leasing

import { useCallback, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  DaneMiesiaca,
  KategoriaKosztu,
  KosztVatInfo,
  MiesiącId,
  UstawieniaPodatkowe,
  WpisTankowania,
  WpisInnegoKosztu,
  ZgloszenieDnia,
} from "@/lib/types";
import { kategoriaLabel, domyslnyVatKategorii } from "@/lib/tax";
import {
  KategoriaBadge,
  KosztSzczegolyPanel,
  SzczegolyToggle,
  vatRateLabel,
} from "../KosztSzczegoly";
import {
  obliczWynagrodzenie,
  obliczKosztPaliwa,
  obliczInneKoszty,
  formatZlCaly,
  parseNum,
} from "@/lib/business-logic";
import {
  getDniMiesiaca,
  isSobota,
  isNiedziela,
  nrDnia,
  nazwaSkrotDnia,
  getDayOfWeek,
  POLSKIE_MIESIACE,
} from "@/lib/dates";
import { NumInput } from "../ui/NumInput";
import { Card, CardTitle } from "../ui/Card";
import {
  IconUsers,
  IconGasStation,
  IconPackage,
  IconCar,
  IconX,
  IconCheck,
  IconAlertTriangle,
} from "../ui/icons";
import { sendPushEvent } from "@/lib/push";
import { logChange } from "@/lib/audit";
import { cn } from "@/lib/utils";

interface Props {
  miesiac: MiesiącId;
  dane: DaneMiesiaca;
  onUpdate: (updater: (prev: DaneMiesiaca) => DaneMiesiaca) => void;
  token: string;
  userName: string;
  ustawienia: UstawieniaPodatkowe;
  // Id zgłoszenia z deep-linku powiadomienia — podświetlamy dzień
  focusZgloszenieId?: string | null;
}

// Separator tygodniowy — linia z wycentrowaną etykietą
function WeekSeparator({ n }: { n: number }) {
  return (
    <div className="flex items-center gap-3 py-1.5" aria-hidden>
      <span className="flex-1 h-px bg-line" />
      <span className="text-[11px] font-medium uppercase tracking-wider text-dim">
        Tydzień {n}
      </span>
      <span className="flex-1 h-px bg-line" />
    </div>
  );
}

// Bursztynowa pill z datą wpisu
function DatePill({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-amber-brand/10 border border-amber-brand/40 rounded-full px-3 py-2 min-h-[40px] text-sm text-amber-brand tabular-nums"
    />
  );
}

export function KosztyTab({ miesiac, dane, onUpdate, token, userName, ustawienia, focusZgloszenieId }: Props) {
  // Rozwinięte panele szczegółów VAT (klucz: id wpisu)
  const [rozwiniete, setRozwiniete] = useState<Record<string, boolean>>({});
  const [autoBusyId, setAutoBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function toggleSzczegoly(id: string) {
    setRozwiniete((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // Powiadom o dodanym koszcie po wyjściu z pola kwoty (z kategorią i VAT)
  function pushKoszt(nazwa: string, koszt: number, wpis?: KosztVatInfo) {
    if (koszt <= 0) return;
    const kategoria = kategoriaLabel(wpis?.kategoria);
    const vat = vatRateLabel(wpis?.vatRate ?? ustawienia.defaultCostVatRate);
    sendPushEvent({
      token,
      author: userName,
      eventType: "koszt",
      body: `${userName} dodał koszt: ${nazwa} ${formatZlCaly(koszt)} — kategoria: ${kategoria}, VAT ${vat}`,
      url: `/admin?miesiac=${miesiac}&zakladka=koszty`,
    });
  }

  // ─── AUTO-KATEGORYZACJA (reguły → AI) ───────────────────────────────────────

  async function autoKategoryzuj(
    id: string,
    nazwa: string,
    koszt: number,
    data: string,
    typ: "tankowanie" | "inne",
    wymus = false
  ) {
    if (!nazwa.trim()) return;
    // Ręcznie ustawionej kategorii nie nadpisujemy automatycznie (sekcja 6),
    // chyba że admin kliknął "Auto-kategoria/VAT" (wymus).
    const lista = typ === "tankowanie" ? dane.tankowanie : dane.inneKoszty;
    const wpis = lista.find((w) => w.id === id);
    if (!wpis) return;
    if (!wymus && wpis.kategoriaZrodlo === "manual") return;

    setAutoBusyId(id);
    try {
      const res = await fetch("/api/categorize-cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nazwa, amount: koszt, date: data || undefined }),
      });
      if (!res.ok) return;
      const w = await res.json();
      if (!w?.category) return;

      const zrodlo = w.source === "rule" ? "rule" : w.source === "ai" ? "ai" : "rule";
      const kategoria = w.category as KategoriaKosztu;
      // VAT: reguła → domyślne kategorii; AI → wynik AI
      const vat =
        w.source === "ai"
          ? {
              vatRate: w.vat_rate,
              vatDeductible: w.vat_deductible,
              vatDeductionPercent: w.vat_deduction_percent,
              amountMode: w.amount_mode,
            }
          : domyslnyVatKategorii(kategoria, ustawienia);

      const patch: Partial<KosztVatInfo> = {
        kategoria,
        kategoriaZrodlo: zrodlo,
        kategoriaConfidence: w.source === "ai" ? w.confidence : undefined,
        kategoriaPotwierdzona: w.source === "ai" ? false : undefined,
        vatZrodlo: zrodlo,
        ...vat,
      };
      if (typ === "tankowanie") updateTankowanie(id, patch);
      else updateInny(id, patch);

      logChange({
        workspaceId: token,
        userName,
        action: "kategoria_auto",
        entity: "cost",
        entityId: id,
        newValue: { kategoria, zrodlo, confidence: w.confidence },
        description:
          w.source === "ai"
            ? `System przypisał kategorię kosztu ${nazwa}: ${kategoriaLabel(kategoria)} (AI, confidence ${Number(w.confidence).toFixed(2)})`
            : `System przypisał kategorię kosztu ${nazwa}: ${kategoriaLabel(kategoria)} (reguła)`,
      });
    } catch {
      // AI niedostępne — koszt zostaje w 'inne', bez crasha
    } finally {
      setAutoBusyId(null);
    }
  }

  function zmienKategorie(
    id: string,
    nazwa: string,
    stara: KategoriaKosztu | undefined,
    nowa: KategoriaKosztu,
    typ: "tankowanie" | "inne"
  ) {
    const defVat = domyslnyVatKategorii(nowa, ustawienia);
    const patch: Partial<KosztVatInfo> = {
      kategoria: nowa,
      kategoriaZrodlo: "manual",
      kategoriaPotwierdzona: undefined,
      kategoriaConfidence: undefined,
      ...defVat,
    };
    if (typ === "tankowanie") updateTankowanie(id, patch);
    else updateInny(id, patch);
    logChange({
      workspaceId: token,
      userName,
      action: "kategoria_zmieniona",
      entity: "cost",
      entityId: id,
      oldValue: { kategoria: stara ?? "inne" },
      newValue: { kategoria: nowa },
      description: `${userName} zmienił kategorię kosztu ${nazwa}: ${kategoriaLabel(stara)} → ${kategoriaLabel(nowa)}`,
    });
  }

  function zatwierdzAI(id: string, nazwa: string, typ: "tankowanie" | "inne") {
    const patch: Partial<KosztVatInfo> = { kategoriaPotwierdzona: true };
    if (typ === "tankowanie") updateTankowanie(id, patch);
    else updateInny(id, patch);
    logChange({
      workspaceId: token,
      userName,
      action: "kategoria_ai_potwierdzona",
      entity: "cost",
      entityId: id,
      description: `${userName} potwierdził kategorię AI dla kosztu ${nazwa}`,
    });
  }

  // Audit ręcznej zmiany pól VAT (z panelu szczegółów)
  function logVatPatch(nazwa: string, id: string, patch: Partial<KosztVatInfo>, stary?: KosztVatInfo) {
    if (patch.vatRate !== undefined && stary) {
      logChange({
        workspaceId: token,
        userName,
        action: "vat_zmieniony",
        entity: "cost",
        entityId: id,
        oldValue: { vatRate: stary.vatRate ?? "0.23" },
        newValue: { vatRate: patch.vatRate },
        description: `${userName} zmienił VAT kosztu ${nazwa}: ${vatRateLabel(stary.vatRate ?? "0.23")} → ${vatRateLabel(patch.vatRate)}`,
      });
    } else if (
      patch.vatDeductible !== undefined ||
      patch.vatDeductionPercent !== undefined ||
      patch.amountMode !== undefined
    ) {
      logChange({
        workspaceId: token,
        userName,
        action: "vat_zmieniony",
        entity: "cost",
        entityId: id,
        newValue: patch as Record<string, unknown>,
        description: `${userName} zmienił ustawienia VAT kosztu ${nazwa}`,
      });
    }
  }

  const allDays = getDniMiesiaca(miesiac);
  const { dniowki, wynagrodzenie, liczbaSobot, premia } = obliczWynagrodzenie(
    miesiac,
    dane.dni
  );

  // ─── ZGŁOSZENIA KIEROWCY ────────────────────────────────────────────────────
  const zgloszenia = dane.zgloszenia ?? [];
  const oczekujace = zgloszenia.filter((z) => z.status === "zgloszony");
  // Mapa dzień → zgłoszenie (do podświetlenia wiersza w tabeli)
  const zglPerDay = new Map(zgloszenia.map((z) => [z.dzien, z]));

  function rozstrzygnij(z: ZgloszenieDnia, przyjmij: boolean) {
    const nrD = z.dzien.slice(8);
    onUpdate((prev) => {
      const noweZgl = (prev.zgloszenia ?? []).map((x) =>
        x.id === z.id
          ? { ...x, status: (przyjmij ? "przyjety" : "odrzucony") as ZgloszenieDnia["status"], rozwiazano: new Date().toISOString() }
          : x
      );
      // Przyjęcie = wpisz proponowaną liczbę kółek do dnia
      const noweDni =
        przyjmij && z.kolkaProponowane !== undefined
          ? {
              ...prev.dni,
              [z.dzien]: {
                ...(prev.dni[z.dzien] ?? { data: z.dzien, kolka: 0, szkolenie: 0 }),
                kolka: z.kolkaProponowane,
              },
            }
          : prev.dni;
      return { ...prev, dni: noweDni, zgloszenia: noweZgl };
    });

    logChange({
      workspaceId: token,
      userName,
      action: przyjmij ? "zgloszenie_przyjete" : "zgloszenie_odrzucone",
      entity: "payroll_day",
      entityId: z.dzien,
      oldValue: { kolka: z.kolkaSystem },
      newValue: { kolka: przyjmij ? z.kolkaProponowane ?? null : z.kolkaSystem },
      description: `${userName} ${przyjmij ? "przyjął" : "odrzucił"} zgłoszenie kierowcy z dnia ${nrD}.${String(miesiac).padStart(2, "0")}${
        przyjmij && z.kolkaProponowane !== undefined ? ` (kółka → ${z.kolkaProponowane})` : ""
      }`,
      url: `/admin?miesiac=${miesiac}&zakladka=koszty&zgloszenie=${encodeURIComponent(z.id)}`,
    });
  }

  // ─── KIEROWCA ──────────────────────────────────────────────────────────────

  const setKolka = useCallback(
    (iso: string, kolka: number) => {
      onUpdate((prev) => ({
        ...prev,
        dni: {
          ...prev.dni,
          [iso]: { ...(prev.dni[iso] ?? { data: iso, kolka: 0, szkolenie: 0 }), kolka },
        },
      }));
    },
    [onUpdate]
  );

  const setSzkolenie = useCallback(
    (iso: string, szkolenie: number) => {
      onUpdate((prev) => ({
        ...prev,
        dni: {
          ...prev.dni,
          [iso]: { ...(prev.dni[iso] ?? { data: iso, kolka: 0, szkolenie: 0 }), szkolenie },
        },
      }));
    },
    [onUpdate]
  );

  // ─── TANKOWANIE ─────────────────────────────────────────────────────────────

  function addTankowanie() {
    onUpdate((prev) => ({
      ...prev,
      tankowanie: [
        ...prev.tankowanie,
        { id: uuidv4(), data: "", koszt: 0 },
      ],
    }));
  }

  function updateTankowanie(id: string, patch: Partial<WpisTankowania>) {
    onUpdate((prev) => ({
      ...prev,
      tankowanie: prev.tankowanie.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }

  // Usuwanie z potwierdzeniem (sekcja 15): confirm → usuń → audit + powiadomienie + toast
  function usunKoszt(
    id: string,
    nazwa: string,
    koszt: number,
    data: string,
    typ: "tankowanie" | "inne"
  ) {
    const dataTxt = data || "(bez daty)";
    const ok = window.confirm(
      `Usunąć koszt?\n\nCzy na pewno chcesz usunąć koszt: ${nazwa} — ${formatZlCaly(koszt)} z dnia ${dataTxt}? Tej operacji nie można cofnąć.\n\n[OK = Usuń koszt / Anuluj]`
    );
    if (!ok) return;

    if (typ === "tankowanie") {
      onUpdate((prev) => ({
        ...prev,
        tankowanie: prev.tankowanie.filter((t) => t.id !== id),
      }));
    } else {
      onUpdate((prev) => ({
        ...prev,
        inneKoszty: prev.inneKoszty.filter((k) => k.id !== id),
      }));
    }
    logChange({
      workspaceId: token,
      userName,
      action: "koszt_usuniety",
      entity: "cost",
      entityId: id,
      oldValue: { nazwa, koszt, data },
      description: `${userName} usunął koszt: ${nazwa} ${formatZlCaly(koszt)}${data ? ` z dnia ${data}` : ""}`,
    });
    showToast("Koszt usunięty");
  }

  // ─── INNE KOSZTY ─────────────────────────────────────────────────────────────

  function addInny() {
    onUpdate((prev) => ({
      ...prev,
      inneKoszty: [
        ...prev.inneKoszty,
        { id: uuidv4(), data: "", nazwa: "", koszt: 0 },
      ],
    }));
  }

  function updateInny(id: string, patch: Partial<WpisInnegoKosztu>) {
    onUpdate((prev) => ({
      ...prev,
      inneKoszty: prev.inneKoszty.map((k) => (k.id === id ? { ...k, ...patch } : k)),
    }));
  }

  // ─── LEASING ─────────────────────────────────────────────────────────────────

  function setLeasing(val: number) {
    onUpdate((prev) => ({ ...prev, leasing: val }));
  }

  const sumaFuel = obliczKosztPaliwa(dane.tankowanie);
  const sumaInne = obliczInneKoszty(dane.inneKoszty);

  // Numer tygodnia rośnie przy każdym poniedziałku (poza pierwszym dniem)
  let weekNum = 1;

  return (
    <div className="space-y-4">
      {/* ── SEKCJA: ZGŁOSZENIA KIEROWCY ──────────────────────────────────── */}
      {oczekujace.length > 0 && (
        <Card className="!border-amber-brand/50">
          <div className="flex items-center gap-2 mb-3">
            <IconAlertTriangle size={18} className="text-amber-brand" />
            <CardTitle className="mb-0">
              Zgłoszenia kierowcy ({oczekujace.length})
            </CardTitle>
          </div>
          <div className="space-y-2">
            {oczekujace.map((z) => {
              const nrD = parseInt(z.dzien.slice(8), 10);
              const podswietl = focusZgloszenieId === z.id;
              return (
                <div
                  key={z.id}
                  className={cn(
                    "rounded-xl border bg-surface2 p-3",
                    podswietl ? "border-amber-brand ring-1 ring-amber-brand" : "border-line"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white">
                        {nrD} {POLSKIE_MIESIACE[miesiac]} — {nazwaSkrotDnia(z.dzien)}
                      </p>
                      <p className="text-xs text-dim mt-0.5">
                        W systemie:{" "}
                        <span className="text-ink font-semibold">{z.kolkaSystem} kółek</span>
                        {z.kolkaProponowane !== undefined && (
                          <>
                            {" → kierowca: "}
                            <span className="text-amber-brand font-semibold">
                              {z.kolkaProponowane} kółek
                            </span>
                          </>
                        )}
                      </p>
                      {z.uwaga && (
                        <p className="text-xs text-dim/80 mt-1 italic">„{z.uwaga}”</p>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => rozstrzygnij(z, true)}
                        title={
                          z.kolkaProponowane !== undefined
                            ? `Przyjmij — wpisz ${z.kolkaProponowane} kółek`
                            : "Przyjmij"
                        }
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-soft border border-green-500/40 text-green-300 text-xs font-bold hover:bg-green-500/20"
                      >
                        <IconCheck size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => rozstrzygnij(z, false)}
                        title="Odrzuć"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-soft border border-red-500/40 text-red-300 text-xs font-bold hover:bg-red-500/20"
                      >
                        <IconX size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── SEKCJA: DNI KIEROWCY ─────────────────────────────────────────── */}
      <Card>
        <CardTitle>Dni kierowcy</CardTitle>

        {/* Nagłówek kolumn */}
        <div className={cn(
          "grid gap-2 text-xs font-bold uppercase tracking-wide text-dim mb-2 px-2",
          miesiac === 6 ? "grid-cols-[1fr_4rem_4rem_6rem]" : "grid-cols-[1fr_4rem_6rem]"
        )}>
          <span>Dzień</span>
          <span className="text-center">Kółka</span>
          {miesiac === 6 && <span className="text-center">Szkoln.</span>}
          <span className="text-right">Dniówka</span>
        </div>

        <div className="space-y-1">
          {allDays.map((iso, dayIdx) => {
            const dzien = dane.dni[iso] ?? { data: iso, kolka: 0, szkolenie: 0 };
            const info = dniowki[iso];
            const kolka = parseNum(dzien.kolka);
            const sob = isSobota(iso);
            const nie = isNiedziela(iso);
            const aktywna = kolka > 0;
            const zglDnia = zglPerDay.get(iso);
            const sporny = zglDnia?.status === "zgloszony";

            const separator =
              dayIdx > 0 && getDayOfWeek(iso) === 1 ? <WeekSeparator n={++weekNum} /> : null;

            return (
              <div key={iso}>
                {separator}
                <div
                  className={cn(
                    "grid gap-2 items-center rounded-xl py-1.5 px-2",
                    sporny && "ring-1 ring-amber-brand",
                    miesiac === 6 ? "grid-cols-[1fr_4rem_4rem_6rem]" : "grid-cols-[1fr_4rem_6rem]"
                  )}
                  style={
                    sob && aktywna
                      ? { background: "var(--sat-bg)" }
                      : nie && aktywna
                      ? { background: "var(--sun-bg)" }
                      : undefined
                  }
                >
                  {/* Data */}
                  <div className="text-sm tabular-nums">
                    <span className={cn("font-bold", aktywna && (sob || nie) ? "text-white" : "text-ink")}>
                      {nrDnia(iso)}
                    </span>
                    <span className={cn(
                      "ml-1.5 text-xs",
                      aktywna && (sob || nie)
                        ? "text-white/70"
                        : sob ? "text-green-400" : nie ? "text-yellow-400" : "text-dim"
                    )}>
                      {nazwaSkrotDnia(iso)}
                    </span>
                  </div>

                  {/* Kółka */}
                  <NumInput
                    value={dzien.kolka || ""}
                    onChange={(v) => setKolka(iso, v)}
                    placeholder="0"
                    className="!py-1.5 !px-2 !text-sm !text-center !w-16"
                  />

                  {/* Szkolenie (tylko czerwiec) */}
                  {miesiac === 6 && (
                    <NumInput
                      value={dzien.szkolenie || ""}
                      onChange={(v) => setSzkolenie(iso, v)}
                      placeholder="0"
                      className="!py-1.5 !px-2 !text-sm !text-center !w-16"
                    />
                  )}

                  {/* Dniówka */}
                  <div className="text-right text-sm tabular-nums">
                    {info?.dniowka ? (
                      <span className={cn("font-bold", aktywna && (sob || nie) ? "text-white" : "text-ink")}>
                        {formatZlCaly(info.dniowka)}
                      </span>
                    ) : (
                      <span className="text-dim/40">—</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Podsumowanie wynagrodzenia */}
        <div className="mt-4 rounded-2xl bg-surface2 border border-line p-4 space-y-1.5">
          <div className="flex items-center gap-2 mb-2">
            <IconUsers size={18} className="text-amber-brand" />
            <span className="text-xs font-bold uppercase tracking-wider text-dim">
              Wynagrodzenie kierowcy
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-dim">Soboty przepracowane</span>
            <span className="tabular-nums text-ink">{liczbaSobot} / 4</span>
          </div>
          {premia > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-amber-brand">Premia (≥4 soboty)</span>
              <span className="tabular-nums text-amber-brand">+ {formatZlCaly(premia)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold pt-2 border-t border-line">
            <span className="text-white">Łącznie</span>
            <span className="tabular-nums text-white text-lg">{formatZlCaly(wynagrodzenie)}</span>
          </div>
        </div>
      </Card>

      {/* ── SEKCJA: TANKOWANIE ───────────────────────────────────────────── */}
      <Card>
        <CardTitle>Tankowanie</CardTitle>
        <div className="space-y-2">
          {dane.tankowanie.map((t) => (
            <div key={t.id}>
              <div className="flex gap-2 items-center">
                <DatePill
                  value={t.data}
                  onChange={(v) => updateTankowanie(t.id, { data: v })}
                />
                <div className="flex-1">
                  <NumInput
                    value={t.koszt}
                    onChange={(v) => updateTankowanie(t.id, { koszt: v })}
                    onBlur={() => pushKoszt("paliwo", t.koszt, { ...t, kategoria: t.kategoria ?? "paliwo_adblue" })}
                    placeholder="0"
                  />
                </div>
                <SzczegolyToggle
                  open={!!rozwiniete[t.id]}
                  onToggle={() => toggleSzczegoly(t.id)}
                />
                <button
                  onClick={() => usunKoszt(t.id, "paliwo", t.koszt, t.data, "tankowanie")}
                  className="shrink-0 p-2 min-h-[40px] rounded-lg text-red-400 hover:bg-red-soft transition-all duration-150"
                  title="Usuń"
                >
                  <IconX size={16} />
                </button>
              </div>
              {rozwiniete[t.id] && (
                <KosztSzczegolyPanel
                  wpis={t}
                  ustawienia={ustawienia}
                  domyslnaKategoria="paliwo_adblue"
                  onPatch={(patch) => {
                    updateTankowanie(t.id, patch);
                    logVatPatch("paliwo", t.id, patch, t);
                  }}
                />
              )}
            </div>
          ))}
        </div>
        <button
          onClick={addTankowanie}
          className="mt-3 w-full py-2.5 min-h-[44px] rounded-xl border border-dashed border-amber-brand/50 text-sm text-amber-brand hover:bg-amber-brand/10 transition-all duration-150"
        >
          + Dodaj tankowanie
        </button>
        {dane.tankowanie.length > 0 && (
          <div className="flex items-center gap-2 mt-3 rounded-2xl bg-surface2 border border-line px-4 py-3">
            <IconGasStation size={18} className="text-amber-brand" />
            <span className="text-sm text-dim flex-1">Suma paliwo</span>
            <span className="tabular-nums text-white font-bold">{formatZlCaly(sumaFuel)}</span>
          </div>
        )}
      </Card>

      {/* ── SEKCJA: INNE KOSZTY ──────────────────────────────────────────── */}
      <Card>
        <CardTitle>Inne koszty</CardTitle>
        <div className="space-y-2">
          {dane.inneKoszty.map((k) => (
            <div key={k.id} className="rounded-xl border border-line/60 p-2 space-y-1.5">
              <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
                <DatePill
                  value={k.data}
                  onChange={(v) => updateInny(k.id, { data: v })}
                />
                <input
                  type="text"
                  value={k.nazwa}
                  onChange={(e) => updateInny(k.id, { nazwa: e.target.value })}
                  onBlur={() => autoKategoryzuj(k.id, k.nazwa, k.koszt, k.data, "inne")}
                  placeholder="Opis…"
                  className="flex-1 min-w-32 bg-input border border-line rounded-[10px] px-3 py-2 text-[15px] text-ink placeholder:text-dim/50"
                />
                <div className="w-28">
                  <NumInput
                    value={k.koszt}
                    onChange={(v) => updateInny(k.id, { koszt: v })}
                    onBlur={() => pushKoszt(k.nazwa || "inny", k.koszt, k)}
                    placeholder="0"
                  />
                </div>
                <SzczegolyToggle
                  open={!!rozwiniete[k.id]}
                  onToggle={() => toggleSzczegoly(k.id)}
                />
                <button
                  onClick={() => usunKoszt(k.id, k.nazwa || "inny", k.koszt, k.data, "inne")}
                  className="shrink-0 p-2 min-h-[40px] rounded-lg text-red-400 hover:bg-red-soft transition-all duration-150"
                  title="Usuń"
                >
                  <IconX size={16} />
                </button>
              </div>

              {/* Kategoria + ostrzeżenia + zatwierdzanie AI */}
              <KategoriaBadge
                wpis={k}
                onZmienKategorie={(nowa) =>
                  zmienKategorie(k.id, k.nazwa || "inny", k.kategoria, nowa, "inne")
                }
                onZatwierdzAI={() => zatwierdzAI(k.id, k.nazwa || "inny", "inne")}
              />

              {rozwiniete[k.id] && (
                <KosztSzczegolyPanel
                  wpis={k}
                  ustawienia={ustawienia}
                  onPatch={(patch) => {
                    updateInny(k.id, patch);
                    logVatPatch(k.nazwa || "inny", k.id, patch, k);
                  }}
                  onAuto={() => autoKategoryzuj(k.id, k.nazwa, k.koszt, k.data, "inne", true)}
                  autoBusy={autoBusyId === k.id}
                />
              )}
            </div>
          ))}
        </div>
        <button
          onClick={addInny}
          className="mt-3 w-full py-2.5 min-h-[44px] rounded-xl border border-dashed border-amber-brand/50 text-sm text-amber-brand hover:bg-amber-brand/10 transition-all duration-150"
        >
          + Dodaj koszt
        </button>
        {dane.inneKoszty.length > 0 && (
          <div className="flex items-center gap-2 mt-3 rounded-2xl bg-surface2 border border-line px-4 py-3">
            <IconPackage size={18} className="text-amber-brand" />
            <span className="text-sm text-dim flex-1">Suma inne koszty</span>
            <span className="tabular-nums text-white font-bold">{formatZlCaly(sumaInne)}</span>
          </div>
        )}
      </Card>

      {/* ── SEKCJA: LEASING ──────────────────────────────────────────────── */}
      <Card>
        <div className="flex items-center gap-3">
          <span className="shrink-0 p-2.5 rounded-xl bg-amber-brand/10 text-amber-brand">
            <IconCar size={22} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Rata leasingu</p>
            <p className="text-xs text-dim">odejmowane co miesiąc</p>
          </div>
          <div className="w-36 relative">
            <NumInput
              value={dane.leasing}
              onChange={setLeasing}
              placeholder="2300"
              className="!text-lg !py-2.5 !pr-10"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-dim pointer-events-none">
              zł
            </span>
          </div>
        </div>
      </Card>

      {/* Info o domyślnym traktowaniu kosztów */}
      <p className="text-[11px] text-dim/60 text-center px-4">
        Domyślnie wszystkie koszty w aplikacji traktowane są jako koszty z faktury
        (brutto, VAT 23%, odliczany). Szczegóły i wyjątki zmienisz przyciskiem „VAT” przy koszcie.
      </p>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-surface border border-green-500/40 text-green-300 text-sm font-medium shadow-2xl animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
