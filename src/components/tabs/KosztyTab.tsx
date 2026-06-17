"use client";

// Zakładka Koszty — sekcje: Dni kierowcy, Tankowanie, Inne koszty, Leasing

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  DaneMiesiaca,
  DayType,
  DocumentStatus,
  DzienKierowcy,
  KategoriaKosztu,
  KosztPayer,
  KosztVatInfo,
  KosztZalacznik,
  MiesiącId,
  UstawieniaPodatkowe,
  WpisTankowania,
  WpisInnegoKosztu,
  ZgloszenieDnia,
} from "@/lib/types";
import { KATEGORIE, kategoriaLabel, domyslnyVatKategorii, rozbijWpis } from "@/lib/tax";
import { TYP_DNIA_LABEL, TYPY_DNIA, typDniaMeta, czyWolny, maKolka, maZlecenia } from "@/lib/day-type";
import { kategoryzujLokalnie } from "@/lib/categorize";
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
  formatZl,
  formatZlCaly,
  parseNum,
  liczDniWgTypu,
} from "@/lib/business-logic";
import { buildFuelStats, FuelStatsRow } from "@/lib/fuel-stats";
import { fuelStatusLabel } from "@/lib/fuel-calculations";
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
  IconPaperclip,
  IconChartBar,
  IconMoneybag,
  IconPlus,
} from "../ui/icons";
import { logChange } from "@/lib/audit";
import { SkanParagonu } from "../SkanParagonu";
import { ZalacznikPreview } from "../ZalacznikPreview";
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
      className="w-full bg-amber-brand/10 border border-amber-brand/40 rounded-full px-3 py-2 min-h-[40px] text-sm text-amber-brand tabular-nums sm:w-auto"
    />
  );
}

function RozliczeniePodatkoweButton({
  checked,
  onClick,
}: {
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors",
        checked
          ? "border-green-500/45 bg-green-soft text-green-300 hover:bg-green-500/20"
          : "border-amber-brand/45 bg-amber-brand/10 text-amber-brand hover:bg-amber-brand/20"
      )}
      title={
        checked
          ? "Koszt wchodzi do VAT i podatku dochodowego"
          : "Koszt zostaje w wyniku, ale bez VAT i podatku dochodowego"
      }
    >
      {checked ? <IconCheck size={11} /> : <IconAlertTriangle size={11} />}
      {checked ? "Rozlicz podatkowo" : "Bez odliczeń"}
    </button>
  );
}

const STATUSY_DOKUMENTU: { id: DocumentStatus; label: string }[] = [
  { id: "brak", label: "brak dokumentu" },
  { id: "paragon", label: "paragon" },
  { id: "faktura", label: "faktura" },
];

const PAYER_OPTIONS: { id: KosztPayer; label: string }[] = [
  { id: "Artur", label: "Artur" },
  { id: "Damian", label: "Damian" },
  { id: "Firma", label: "Firma" },
];

type PayerFilter = "all" | KosztPayer;
type PodkategoriaKosztow = "all" | "tankowanie" | "samochod_dzialalnosc";
type WidokKosztow =
  | "podsumowanie"
  | "wyplata"
  | "tankowanie"
  | "samochod"
  | "rozliczenie"
  | "statystyki";

const PODKATEGORIE_KOSZTOW: { id: PodkategoriaKosztow; label: string }[] = [
  { id: "all", label: "wszystkie" },
  { id: "tankowanie", label: "Tankowanie" },
  { id: "samochod_dzialalnosc", label: "Samochód i działalność" },
];

const WIDOKI_KOSZTOW: { id: WidokKosztow; label: string; short: string }[] = [
  { id: "podsumowanie", label: "Podsumowanie", short: "Podsum." },
  { id: "wyplata", label: "Wypłata kierowcy", short: "Wypł." },
  { id: "tankowanie", label: "Tankowanie", short: "Paliwo" },
  { id: "samochod", label: "Samochód i działalność", short: "Auto" },
  { id: "rozliczenie", label: "Rozliczenie 50/50", short: "50/50" },
  { id: "statystyki", label: "Statystyki tankowania", short: "Stat." },
];

function statusDokumentu(wpis: KosztVatInfo): DocumentStatus {
  if (wpis.documentStatus) return wpis.documentStatus;
  return (wpis.hasInvoice ?? true) ? "faktura" : "brak";
}

function normalizePayer(value: KosztVatInfo["paidBy"] | string | undefined): KosztPayer {
  return PAYER_OPTIONS.some((p) => p.id === value) ? (value as KosztPayer) : "Firma";
}

function podkategoriaKosztu(typ: "tankowanie" | "inne", kategoria: KategoriaKosztu | undefined): Exclude<PodkategoriaKosztow, "all"> {
  if (typ === "tankowanie" || kategoria === "paliwo_adblue") return "tankowanie";
  return "samochod_dzialalnosc";
}

function KosztySectionSwitch({
  active,
  onChange,
}: {
  active: WidokKosztow;
  onChange: (value: WidokKosztow) => void;
}) {
  return (
    <div className="sticky top-[128px] z-[2] -mx-3 overflow-x-auto bg-bg/75 px-3 py-2 backdrop-blur-xl sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:py-0">
      <div className="flex gap-1 sm:gap-1.5">
        {WIDOKI_KOSZTOW.map((widok) => (
          <button
            key={widok.id}
            type="button"
            onClick={() => onChange(widok.id)}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1.5 text-[11px] font-extrabold transition-all sm:px-3 sm:py-2 sm:text-xs",
              active === widok.id
                ? "border-amber-brand bg-amber-brand text-amber-ink"
                : "border-line bg-surface/80 text-dim hover:border-amber-brand/50 hover:text-ink"
            )}
          >
            <span className="hidden sm:inline">{widok.label}</span>
            <span className="sm:hidden">{widok.short}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function KosztyMetricCard({
  icon,
  label,
  value,
  tone = "normal",
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "normal" | "amber" | "green" | "red";
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border",
            tone === "green"
              ? "border-green-500/35 bg-green-soft text-green-300"
              : tone === "red"
              ? "border-red-500/35 bg-red-soft text-red-300"
              : "border-amber-brand/35 bg-amber-brand/10 text-amber-brand"
          )}
        >
          {icon}
        </span>
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-dim">{label}</p>
      </div>
      <p
        className={cn(
          "tabular-nums text-lg font-extrabold",
          tone === "green"
            ? "text-green-300"
            : tone === "red"
            ? "text-red-300"
            : tone === "amber"
            ? "text-amber-brand"
            : "text-white"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[10px] leading-snug text-dim/75">{hint}</p>}
    </div>
  );
}

function PayerSelect({
  value,
  onChange,
  compact = false,
  className,
}: {
  value?: KosztVatInfo["paidBy"];
  onChange: (value: KosztPayer) => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("block text-[11px] font-semibold text-dim", compact && "min-w-[118px]", className)}>
      <span className="sr-only sm:not-sr-only">Kto zapłacił?</span>
      <select
        value={normalizePayer(value)}
        onChange={(e) => onChange(e.target.value as KosztPayer)}
        className="mt-0 sm:mt-1 w-full min-h-[40px] rounded-full border border-line bg-input px-3 py-2 text-xs font-bold text-ink"
        title="Kto zapłacił koszt?"
      >
        {PAYER_OPTIONS.map((payer) => (
          <option key={payer.id} value={payer.id}>
            {payer.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function VatMiniInfo({
  wpis,
  ustawienia,
  domyslnaKategoria = "inne",
}: {
  wpis: KosztVatInfo & { koszt: number };
  ustawienia: UstawieniaPodatkowe;
  domyslnaKategoria?: KategoriaKosztu;
}) {
  const r = rozbijWpis(wpis, ustawienia, domyslnaKategoria);
  const defVat = domyslnyVatKategorii(wpis.kategoria ?? domyslnaKategoria, ustawienia);
  const vatRate = wpis.vatRate ?? defVat.vatRate;
  return (
    <div className="grid grid-cols-2 gap-1.5 text-[11px] sm:flex sm:flex-wrap">
      <span className="rounded-full border border-line bg-surface2 px-2 py-1 text-dim">
        VAT: <b className="text-ink">{vatRateLabel(vatRate)}</b>
      </span>
      <span className="rounded-full border border-line bg-surface2 px-2 py-1 text-dim">
        netto: <b className="text-ink">{formatZl(r.netto)}</b>
      </span>
      <span className="rounded-full border border-line bg-surface2 px-2 py-1 text-dim">
        VAT kwota: <b className="text-ink">{formatZl(r.vat)}</b>
      </span>
      <span className="rounded-full border border-line bg-surface2 px-2 py-1 text-dim">
        odliczenie: <b className="text-green-300">{formatZl(r.vatDoOdliczenia)}</b>
      </span>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Nie udało się odczytać pliku"));
    reader.readAsDataURL(file);
  });
}

async function imageToCompressedDataUrl(file: File): Promise<string> {
  const raw = await readFileAsDataUrl(file);
  if (!file.type.startsWith("image/")) return raw;

  const img = new Image();
  img.src = raw;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Nie udało się przetworzyć zdjęcia"));
  });

  const maxSide = 1400;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return raw;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.74);
}

async function fileToZalacznik(file: File, typ: KosztZalacznik["typ"]): Promise<KosztZalacznik> {
  const dataUrl = await imageToCompressedDataUrl(file);
  const res = await fetch("/api/attachments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl }),
  });
  if (!res.ok) throw new Error("Nie udało się wgrać załącznika");
  const { path } = (await res.json()) as { path: string };
  return {
    id: uuidv4(),
    typ,
    nazwa: file.name,
    mime: file.type || "image/jpeg",
    storagePath: path,
    createdAt: new Date().toISOString(),
  };
}

function DokumentyKosztu({
  wpis,
  onStatus,
  onAdd,
  onRemove,
  showLicznik = false,
}: {
  wpis: KosztVatInfo;
  onStatus: (status: DocumentStatus) => void;
  onAdd: (file: File, typ: KosztZalacznik["typ"]) => void;
  onRemove: (id: string) => void;
  showLicznik?: boolean;
}) {
  const status = statusDokumentu(wpis);
  const zalaczniki = wpis.zalaczniki ?? [];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        value={status}
        onChange={(e) => onStatus(e.target.value as DocumentStatus)}
        title="Status dokumentu kosztu"
        className={cn(
          "rounded-full border px-2.5 py-1 text-[10px] font-bold",
          status === "brak"
            ? "border-red-500/45 bg-red-soft text-red-200"
            : "border-green-500/45 bg-green-soft text-green-300"
        )}
      >
        {STATUSY_DOKUMENTU.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>

      <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-amber-brand/45 px-2.5 py-1 text-[10px] font-bold text-amber-brand hover:bg-amber-brand/10">
        <IconPaperclip size={11} />
        + dokument
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.currentTarget.value = "";
            if (file) onAdd(file, "dokument");
          }}
        />
      </label>

      {showLicznik && (
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[10px] font-bold text-dim hover:text-ink hover:bg-surface2">
          <IconGasStation size={11} />
          + licznik
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = "";
              if (file) onAdd(file, "licznik");
            }}
          />
        </label>
      )}

      {zalaczniki.map((z) => (
        <div
          key={z.id}
          className="inline-flex items-center gap-1 rounded-full bg-surface2 border border-line px-2 py-1 text-[10px] text-dim"
        >
          <ZalacznikPreview
            zalaczniki={[z]}
            label={z.typ === "licznik" ? "Podgląd licznika" : "Podgląd dokumentu"}
            compact
          />
          <button
            type="button"
            onClick={() => onRemove(z.id)}
            className="text-red-300 hover:text-red-200"
            title="Usuń załącznik"
          >
            <IconX size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}

// Paginacja list kosztów — ile pozycji na stronę
const KOSZTY_NA_STRONE = 7;

/** Numerowany pager (np. dla list kosztów). Ukrywa się przy jednej stronie. */
function Pager({ strona, total, onZmiana }: { strona: number; total: number; onZmiana: (s: number) => void }) {
  if (total <= 1) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onZmiana(n)}
          className={cn(
            "min-w-[36px] h-9 px-2 rounded-lg text-sm font-semibold border transition-colors",
            n === strona
              ? "bg-amber-brand text-amber-ink border-amber-brand"
              : "border-line text-dim hover:text-ink"
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function formatLitry(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return "brak danych";
  return `${value.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L`;
}

function formatZlNaLitr(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return "brak danych";
  return `${value.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł/L`;
}

function formatKm(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return "—";
  return `${value.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} km`;
}

function formatL100(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return "—";
  return `${value.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L/100`;
}

function formatZlKm(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return "—";
  return `${value.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł/km`;
}

function FuelStatsValue({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: string;
  tone?: "normal" | "amber" | "green";
}) {
  return (
    <div className="rounded-xl border border-line bg-surface2 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-dim">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-extrabold tabular-nums",
          tone === "amber" ? "text-amber-brand" : tone === "green" ? "text-green-300" : "text-white"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function FuelStatsRowView({ row }: { row: FuelStatsRow }) {
  return (
    <tr className={cn("border-t border-line/60", row.pomijanyPowod && "opacity-60")}>
      <td className="px-2 py-2 tabular-nums text-ink">{row.data}</td>
      <td className="px-2 py-2 text-dim">{row.kierowca ?? "—"}</td>
      <td className="px-2 py-2 text-dim">—</td>
      <td className="px-2 py-2 text-dim">{row.stacja ?? "—"}</td>
      <td className="px-2 py-2 text-right tabular-nums text-ink">{formatLitry(row.litry)}</td>
      <td className="px-2 py-2 text-right tabular-nums font-bold text-white">{formatZl(row.brutto)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-ink">{formatKm(row.odometerKm)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-ink">{formatKm(row.kmSinceLastFuel)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-ink">{formatLitry(row.fuelBeforeRefuelLiters)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-ink">{formatZlKm(row.costPerKmGross)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-ink">{formatL100(row.fuelConsumptionLPer100Km)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-dim">{row.vatRate ? vatRateLabel(row.vatRate) : "—"}</td>
      <td className="px-2 py-2">
        <ZalacznikPreview zalaczniki={row.zalaczniki.filter((z) => z.typ === "dokument")} label="Dokument" compact />
      </td>
      <td className="px-2 py-2">
        <ZalacznikPreview zalaczniki={row.zalaczniki.filter((z) => z.typ === "licznik")} label="Licznik" emptyLabel="—" compact />
      </td>
      <td className="px-2 py-2">
        <span className={cn(
          "rounded-full border px-2 py-0.5 text-[10px] font-bold",
          row.fuelStatus === "ok" ? "border-green-500/40 text-green-300" : "border-amber-brand/40 text-amber-brand"
        )}>
          {row.pomijanyPowod ?? fuelStatusLabel(row.fuelStatus ?? undefined)}
        </span>
      </td>
    </tr>
  );
}

function FuelStatsMobileCard({ row }: { row: FuelStatsRow }) {
  return (
    <div className={cn("rounded-xl border border-line bg-surface2/60 p-3", row.pomijanyPowod && "opacity-60")}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">{row.stacja ?? "Tankowanie"}</p>
          <p className="text-[11px] text-dim">
            {row.data} · {row.kierowca ?? "bez kierowcy"}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-amber-brand/35 bg-amber-brand/10 px-2 py-0.5 text-[11px] font-bold text-amber-brand">
          {formatLitry(row.litry)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <p className="text-dim">Brutto</p>
          <p className="tabular-nums font-bold text-white">{formatZl(row.brutto)}</p>
        </div>
        <div>
          <p className="text-dim">Netto</p>
          <p className="tabular-nums font-bold text-ink">{formatZl(row.netto)}</p>
        </div>
        <div>
          <p className="text-dim">VAT</p>
          <p className="tabular-nums font-bold text-ink">{formatZl(row.vat)}</p>
        </div>
        <div>
          <p className="text-dim">Cena brutto/l</p>
          <p className="tabular-nums font-bold text-ink">{formatZlNaLitr(row.cenaBruttoZaLitr)}</p>
        </div>
        <div>
          <p className="text-dim">Przebieg</p>
          <p className="tabular-nums font-bold text-ink">{formatKm(row.odometerKm)}</p>
        </div>
        <div>
          <p className="text-dim">Km od ost.</p>
          <p className="tabular-nums font-bold text-ink">{formatKm(row.kmSinceLastFuel)}</p>
        </div>
        <div>
          <p className="text-dim">Spalanie</p>
          <p className="tabular-nums font-bold text-ink">{formatL100(row.fuelConsumptionLPer100Km)}</p>
        </div>
        <div>
          <p className="text-dim">Brutto/km</p>
          <p className="tabular-nums font-bold text-ink">{formatZlKm(row.costPerKmGross)}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ZalacznikPreview zalaczniki={row.zalaczniki.filter((z) => z.typ === "dokument")} label="Dokument" compact />
        <ZalacznikPreview zalaczniki={row.zalaczniki.filter((z) => z.typ === "licznik")} label="Licznik" emptyLabel="" compact />
        <span className={cn(
          "rounded-full border px-2 py-0.5 text-[10px] font-bold",
          row.fuelStatus === "ok" ? "border-green-500/40 text-green-300" : "border-amber-brand/40 text-amber-brand"
        )}>
          {row.pomijanyPowod ?? fuelStatusLabel(row.fuelStatus ?? undefined)}
        </span>
      </div>
    </div>
  );
}

function FuelStatsPanel({
  dane,
  ustawienia,
  miesiac,
}: {
  dane: DaneMiesiaca;
  ustawienia: UstawieniaPodatkowe;
  miesiac: MiesiącId;
}) {
  const [kierowca, setKierowca] = useState("");
  const [stacja, setStacja] = useState("");
  const stats = useMemo(
    () =>
      buildFuelStats(dane, ustawienia, {
        kierowca: kierowca || undefined,
        stacja: stacja || undefined,
      }),
    [dane, ustawienia, kierowca, stacja]
  );
  const s = stats.summary;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <IconGasStation size={18} className="text-amber-brand" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold uppercase tracking-wider text-dim">
            Statystyki tankowania
          </h3>
          <p className="text-[11px] text-dim/70">
            {POLSKIE_MIESIACE[miesiac]} 2026 · spalanie liczone ważone: suma litrów / suma km × 100
          </p>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-[11px] font-semibold text-dim">
          Kierowca
          <select
            value={kierowca}
            onChange={(e) => setKierowca(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-input px-2 py-2 text-sm text-ink"
          >
            <option value="">wszyscy</option>
            {stats.filters.kierowcy.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-dim">
          Stacja
          <select
            value={stacja}
            onChange={(e) => setStacja(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-input px-2 py-2 text-sm text-ink"
          >
            <option value="">wszystkie</option>
            {stats.filters.stacje.map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FuelStatsValue label="Łącznie litrów" value={formatLitry(s.sumaLitrow)} tone="amber" />
        <FuelStatsValue label="Łącznie km" value={formatKm(s.sumaKm)} tone="amber" />
        <FuelStatsValue label="Liczba tankowań" value={`${s.liczbaTankowan}`} />
        <FuelStatsValue label="Śr. spalanie" value={formatL100(s.srednieSpalanieLPer100Km)} tone="green" />
        <FuelStatsValue label="Śr. brutto/km" value={formatZlKm(s.sredniKosztBruttoKm)} tone="green" />
        <FuelStatsValue label="Śr. netto/km" value={formatZlKm(s.sredniKosztNettoKm)} />
        <FuelStatsValue label="Śr. paliwo przed tank." value={formatLitry(s.sredniePaliwoPrzedTankowaniem)} />
        <FuelStatsValue label="Śr. brutto/l" value={formatZlNaLitr(s.sredniaBruttoZaLitr)} tone="amber" />
        <FuelStatsValue label="Śr. netto/l" value={formatZlNaLitr(s.sredniaNettoZaLitr)} />
        <FuelStatsValue label="Kwota brutto" value={formatZl(s.brutto)} tone="green" />
        <FuelStatsValue label="Kwota netto" value={formatZl(s.netto)} />
        <FuelStatsValue label="VAT" value={formatZl(s.vat)} />
        <FuelStatsValue label="OK" value={`${s.ok}`} tone="green" />
        <FuelStatsValue label="Do sprawdzenia" value={`${s.doSprawdzenia}`} tone={s.doSprawdzenia > 0 ? "amber" : "normal"} />
        <FuelStatsValue label="Pominięto" value={`${s.pominiete}`} />
      </div>

      <div className="mt-4 space-y-2 sm:hidden">
        {stats.rows.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface2/60 px-3 py-6 text-center text-sm text-dim">
            Brak tankowań w tym miesiącu.
          </div>
        ) : (
          stats.rows.map((row) => <FuelStatsMobileCard key={row.id} row={row} />)
        )}
      </div>

      <div className="mt-4 hidden overflow-x-auto rounded-xl border border-line sm:block">
        <table className="min-w-[1320px] w-full text-left text-xs">
          <thead className="bg-surface2 text-[10px] uppercase tracking-wide text-dim">
            <tr>
              <th className="px-2 py-2">Data</th>
              <th className="px-2 py-2">Kierowca</th>
              <th className="px-2 py-2">Auto</th>
              <th className="px-2 py-2">Stacja</th>
              <th className="px-2 py-2 text-right">Litry</th>
              <th className="px-2 py-2 text-right">Brutto</th>
              <th className="px-2 py-2 text-right">Przebieg</th>
              <th className="px-2 py-2 text-right">Km od ost.</th>
              <th className="px-2 py-2 text-right">Paliwo przed</th>
              <th className="px-2 py-2 text-right">Zł/km</th>
              <th className="px-2 py-2 text-right">L/100</th>
              <th className="px-2 py-2 text-right">VAT %</th>
              <th className="px-2 py-2">Dokument</th>
              <th className="px-2 py-2">Licznik</th>
              <th className="px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {stats.rows.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-3 py-6 text-center text-sm text-dim">
                  Brak tankowań w tym miesiącu.
                </td>
              </tr>
            ) : (
              stats.rows.map((row) => <FuelStatsRowView key={row.id} row={row} />)
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

type RozliczenieKosztu = {
  id: string;
  nazwa: string;
  paidBy: KosztPayer;
  kategoria: KategoriaKosztu;
  podkategoria: Exclude<PodkategoriaKosztow, "all">;
  netto: number;
  vat: number;
  brutto: number;
};

type PayerSuma = {
  paidBy: KosztPayer | "Razem";
  liczba: number;
  netto: number;
  vat: number;
  brutto: number;
};

function emptyPayerSuma(paidBy: PayerSuma["paidBy"]): PayerSuma {
  return { paidBy, liczba: 0, netto: 0, vat: 0, brutto: 0 };
}

function addToSuma(suma: PayerSuma, koszt: Pick<RozliczenieKosztu, "netto" | "vat" | "brutto">) {
  suma.liczba += 1;
  suma.netto += koszt.netto;
  suma.vat += koszt.vat;
  suma.brutto += koszt.brutto;
}

function rozliczenieRows(pozycje: RozliczenieKosztu[]): PayerSuma[] {
  const map = new Map<KosztPayer | "Razem", PayerSuma>([
    ["Artur", emptyPayerSuma("Artur")],
    ["Damian", emptyPayerSuma("Damian")],
    ["Firma", emptyPayerSuma("Firma")],
    ["Razem", emptyPayerSuma("Razem")],
  ]);

  for (const koszt of pozycje) {
    addToSuma(map.get(koszt.paidBy)!, koszt);
    addToSuma(map.get("Razem")!, koszt);
  }

  return ["Artur", "Damian", "Firma", "Razem"].map((x) => map.get(x as PayerSuma["paidBy"])!);
}

function RozliczenieRowView({ row }: { row: PayerSuma }) {
  const isTotal = row.paidBy === "Razem";
  return (
    <tr className={cn("border-t border-line/60", isTotal && "bg-surface2 font-bold text-white")}>
      <td className="px-3 py-2 text-ink">{row.paidBy}</td>
      <td className="px-3 py-2 text-right tabular-nums text-dim">{row.liczba}</td>
      <td className="px-3 py-2 text-right tabular-nums text-ink">{formatZl(row.netto)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-ink">{formatZl(row.vat)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-white">{formatZl(row.brutto)}</td>
    </tr>
  );
}

function RozliczenieMobileCard({ row }: { row: PayerSuma }) {
  const isTotal = row.paidBy === "Razem";
  return (
    <div className={cn("rounded-xl border border-line bg-surface2/60 p-3", isTotal && "border-amber-brand/35 bg-amber-brand/10")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-white">{row.paidBy}</p>
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-dim">
          {row.liczba} kosztów
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <p className="text-dim">Netto</p>
          <p className="tabular-nums font-bold text-ink">{formatZl(row.netto)}</p>
        </div>
        <div>
          <p className="text-dim">VAT</p>
          <p className="tabular-nums font-bold text-ink">{formatZl(row.vat)}</p>
        </div>
        <div>
          <p className="text-dim">Brutto</p>
          <p className="tabular-nums font-bold text-white">{formatZl(row.brutto)}</p>
        </div>
      </div>
    </div>
  );
}

function RozliczenieKosztowPanel({
  dane,
  ustawienia,
  miesiac,
}: {
  dane: DaneMiesiaca;
  ustawienia: UstawieniaPodatkowe;
  miesiac: MiesiącId;
}) {
  const [podkategoria, setPodkategoria] = useState<PodkategoriaKosztow>("all");
  const [kategoria, setKategoria] = useState<"all" | KategoriaKosztu>("all");
  const [payer, setPayer] = useState<PayerFilter>("all");

  const pozycje = useMemo<RozliczenieKosztu[]>(() => {
    const rows: RozliczenieKosztu[] = [];

    for (const t of dane.tankowanie ?? []) {
      if (parseNum(t.koszt) <= 0) continue;
      const wpis = { ...t, kategoria: t.kategoria ?? ("paliwo_adblue" as KategoriaKosztu) };
      const r = rozbijWpis(wpis, ustawienia, "paliwo_adblue");
      rows.push({
        id: t.id,
        nazwa: "Tankowanie",
        paidBy: normalizePayer(t.paidBy),
        kategoria: r.kategoria,
        podkategoria: "tankowanie",
        netto: r.netto,
        vat: r.vat,
        brutto: r.brutto,
      });
    }

    for (const k of dane.inneKoszty ?? []) {
      if (parseNum(k.koszt) <= 0) continue;
      const r = rozbijWpis(k, ustawienia, "inne");
      rows.push({
        id: k.id,
        nazwa: k.nazwa || "Koszt",
        paidBy: normalizePayer(k.paidBy),
        kategoria: r.kategoria,
        podkategoria: podkategoriaKosztu("inne", r.kategoria),
        netto: r.netto,
        vat: r.vat,
        brutto: r.brutto,
      });
    }

    return rows;
  }, [dane.tankowanie, dane.inneKoszty, ustawienia]);

  const przefiltrowane = useMemo(
    () =>
      pozycje.filter((koszt) => {
        if (podkategoria !== "all" && koszt.podkategoria !== podkategoria) return false;
        if (kategoria !== "all" && koszt.kategoria !== kategoria) return false;
        if (payer !== "all" && koszt.paidBy !== payer) return false;
        return true;
      }),
    [pozycje, podkategoria, kategoria, payer]
  );

  const doRozliczenia5050 = useMemo(
    () =>
      pozycje.filter((koszt) => {
        if (podkategoria !== "all" && koszt.podkategoria !== podkategoria) return false;
        if (kategoria !== "all" && koszt.kategoria !== kategoria) return false;
        return true;
      }),
    [pozycje, podkategoria, kategoria]
  );

  const rows = useMemo(() => rozliczenieRows(przefiltrowane), [przefiltrowane]);
  const rows5050 = useMemo(() => rozliczenieRows(doRozliczenia5050), [doRozliczenia5050]);
  const arturPaid = rows5050.find((r) => r.paidBy === "Artur")?.brutto ?? 0;
  const damianPaid = rows5050.find((r) => r.paidBy === "Damian")?.brutto ?? 0;
  const firmaPaid = rows5050.find((r) => r.paidBy === "Firma")?.brutto ?? 0;
  const privateTotal = arturPaid + damianPaid;
  const eachShare = privateTotal / 2;
  const diff = Math.round((arturPaid - eachShare) * 100) / 100;
  const settlement =
    Math.abs(diff) < 0.01
      ? "Artur i Damian są rozliczeni na zero."
      : diff > 0
      ? `Damian powinien oddać Arturowi: ${formatZl(diff)}`
      : `Artur powinien oddać Damianowi: ${formatZl(Math.abs(diff))}`;

  return (
    <Card>
      <div className="mb-3 flex items-start gap-2">
        <IconUsers size={18} className="mt-0.5 text-amber-brand" />
        <div className="min-w-0 flex-1">
          <CardTitle className="mb-1">Rozliczenie kosztów</CardTitle>
          <p className="text-[11px] text-dim">
            {POLSKIE_MIESIACE[miesiac]} 2026 · tylko koszty z faktur/paragonów, bez wypłaty kierowcy.
          </p>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="text-[11px] font-semibold text-dim">
          Podkategoria
          <select
            value={podkategoria}
            onChange={(e) => setPodkategoria(e.target.value as PodkategoriaKosztow)}
            className="mt-1 w-full min-h-[42px] rounded-lg border border-line bg-input px-2 py-2 text-sm text-ink"
          >
            {PODKATEGORIE_KOSZTOW.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-dim">
          Kategoria
          <select
            value={kategoria}
            onChange={(e) => setKategoria(e.target.value as "all" | KategoriaKosztu)}
            className="mt-1 w-full min-h-[42px] rounded-lg border border-line bg-input px-2 py-2 text-sm text-ink"
          >
            <option value="all">wszystkie</option>
            {KATEGORIE.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-dim">
          Kto zapłacił
          <select
            value={payer}
            onChange={(e) => setPayer(e.target.value as PayerFilter)}
            className="mt-1 w-full min-h-[42px] rounded-lg border border-line bg-input px-2 py-2 text-sm text-ink"
          >
            <option value="all">wszyscy</option>
            {PAYER_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-2 sm:hidden">
        {rows.map((row) => (
          <RozliczenieMobileCard key={row.paidBy} row={row} />
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-line sm:block">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface2 text-[10px] uppercase tracking-wide text-dim">
            <tr>
              <th className="px-3 py-2">Kto zapłacił</th>
              <th className="px-3 py-2 text-right">Liczba</th>
              <th className="px-3 py-2 text-right">Suma netto</th>
              <th className="px-3 py-2 text-right">VAT z dokumentów</th>
              <th className="px-3 py-2 text-right">Suma brutto</th>
            </tr>
          </thead>
          <tbody>{rows.map((row) => <RozliczenieRowView key={row.paidBy} row={row} />)}</tbody>
        </table>
      </div>

      <div className="mt-3 rounded-2xl border border-amber-brand/35 bg-amber-brand/10 p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-brand">
          Rozliczenie 50/50 Artur / Damian
        </p>
        <div className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-3">
            <span className="text-dim">Artur zapłacił</span>
            <span className="tabular-nums font-bold text-white">{formatZl(arturPaid)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-dim">Damian zapłacił</span>
            <span className="tabular-nums font-bold text-white">{formatZl(damianPaid)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-dim">Firma zapłaciła</span>
            <span className="tabular-nums font-bold text-white">{formatZl(firmaPaid)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-dim">Koszty prywatne</span>
            <span className="tabular-nums font-bold text-white">{formatZl(privateTotal)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-dim">Udział Artura</span>
            <span className="tabular-nums font-bold text-white">{formatZl(eachShare)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-dim">Udział Damiana</span>
            <span className="tabular-nums font-bold text-white">{formatZl(eachShare)}</span>
          </div>
        </div>
        <p className="mt-3 rounded-xl bg-surface/70 px-3 py-2 text-sm font-bold text-white">
          {settlement}
        </p>
        <p className="mt-2 text-[11px] text-dim">
          Do długu 50/50 liczą się tylko koszty oznaczone jako Artur albo Damian. Filtr „Kto zapłacił” zawęża tabelę, ale samo 50/50 zawsze porównuje Artura i Damiana.
        </p>
      </div>
    </Card>
  );
}

export function KosztyTab({ miesiac, dane, onUpdate, token, userName, ustawienia, focusZgloszenieId }: Props) {
  // Rozwinięte panele szczegółów VAT (klucz: id wpisu)
  const [rozwiniete, setRozwiniete] = useState<Record<string, boolean>>({});
  const [autoBusyId, setAutoBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [widokKosztow, setWidokKosztow] = useState<WidokKosztow>("podsumowanie");
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  // Paginacja list kosztów (1-indeksowana)
  const [stronaTank, setStronaTank] = useState(1);
  const [stronaInne, setStronaInne] = useState(1);
  // Dni, w których stawka zlecenia jest „własna" (nie 50/100)
  const [innaStawka, setInnaStawka] = useState<Record<string, boolean>>({});
  // Id wpisów już objętych automatycznym backfillem (żeby nie powtarzać AI)
  const backfillDone = useRef<Set<string>>(new Set());
  const payerBackfillDone = useRef<Set<MiesiącId>>(new Set());
  const notifiedCostValues = useRef<Record<string, string>>({});
  const dayEditStart = useRef<Record<string, number>>({});

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function toggleSzczegoly(id: string) {
    setRozwiniete((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // Powiadom o dodanym koszcie po wyjściu z pola kwoty (z kategorią i VAT)
  function pushKoszt(id: string, nazwa: string, koszt: number, wpis?: KosztVatInfo) {
    if (koszt <= 0) return;
    const key = `${koszt}|${nazwa}|${wpis?.kategoria ?? ""}|${wpis?.vatRate ?? ""}|${wpis?.hasInvoice ?? ""}`;
    if (notifiedCostValues.current[id] === key) return;
    notifiedCostValues.current[id] = key;

    const kategoria = kategoriaLabel(wpis?.kategoria);
    const vat = vatRateLabel(wpis?.vatRate ?? ustawienia.defaultCostVatRate);
    const rozliczany = wpis?.hasInvoice ?? ustawienia.defaultCostHasInvoice;
    logChange({
      workspaceId: token,
      userName,
      action: "koszt_dodany",
      entity: "cost",
      entityId: id,
      newValue: { nazwa, koszt, kategoria, vat, rozliczanyPodatkowo: rozliczany },
      description: `${userName} dodał koszt: ${nazwa} ${formatZlCaly(koszt)} — ${kategoria}, VAT ${vat}${
        rozliczany ? "" : ", bez odliczeń"
      }`,
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

      // Fallback = AI niedostępne (brak klucza / błąd). Nie zapisujemy źródła,
      // żeby po dodaniu klucza wpis został ponownie przeanalizowany — chyba że
      // admin wymusił ręcznie (wtedy akceptujemy 'inne' jako wynik).
      if (w.source === "fallback" && !wymus) return;

      const zAI = w.source === "ai";
      const reg = kategoryzujLokalnie(nazwa); // kategoria z reguły (lub null)
      const patch: Partial<KosztVatInfo> = {};
      let opisKat = "";

      if (zAI) {
        // VAT (stawka, odliczalność, tryb) ZAWSZE z AI — dla każdego kosztu
        patch.vatRate = w.vat_rate;
        patch.vatDeductible = w.vat_deductible;
        patch.vatDeductionPercent = w.vat_deduction_percent;
        patch.amountMode = w.amount_mode;
        patch.vatZrodlo = "ai";

        if (reg) {
          // Reguła trafiła w kategorię → bierzemy ją (czysto, bez badge), VAT z AI
          patch.kategoria = reg;
          patch.kategoriaZrodlo = "rule";
          patch.kategoriaConfidence = undefined;
          patch.kategoriaPotwierdzona = undefined;
          opisKat = `${kategoriaLabel(reg)} (reguła) + VAT ${w.vat_rate} (AI)`;
        } else {
          // Brak reguły → kategoria z AI (z badge do potwierdzenia)
          patch.kategoria = w.category as KategoriaKosztu;
          patch.kategoriaZrodlo = "ai";
          patch.kategoriaConfidence = w.confidence;
          patch.kategoriaPotwierdzona = false;
          opisKat = `${kategoriaLabel(patch.kategoria)} + VAT (AI, confidence ${Number(w.confidence).toFixed(2)})`;
        }
      } else {
        // Brak klucza / błąd → reguła nadaje kategorię + VAT produktu z endpointu
        // (nie domyślne 23% kategorii, bo np. pieczywo/woda powinny mieć 5%).
        const kategoria = w.category as KategoriaKosztu;
        Object.assign(patch, {
          kategoria,
          kategoriaZrodlo: "rule" as const,
          kategoriaConfidence: undefined,
          kategoriaPotwierdzona: undefined,
          vatRate: w.vat_rate,
          vatDeductible: w.vat_deductible,
          vatDeductionPercent: w.vat_deduction_percent,
          amountMode: w.amount_mode,
          vatZrodlo: "rule" as const,
        });
        opisKat = `${kategoriaLabel(kategoria)} (reguła) + VAT ${w.vat_rate}`;
      }

      if (typ === "tankowanie") updateTankowanie(id, patch);
      else updateInny(id, patch);

      logChange({
        workspaceId: token,
        userName,
        action: "kategoria_auto",
        entity: "cost",
        entityId: id,
        newValue: patch as Record<string, unknown>,
        description: `System przypisał koszt ${nazwa}: ${opisKat}`,
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
    if (patch.hasInvoice !== undefined) {
      logChange({
        workspaceId: token,
        userName,
        action: "koszt_podatkowy_zmieniony",
        entity: "cost",
        entityId: id,
        oldValue: stary?.hasInvoice !== undefined ? { hasInvoice: stary.hasInvoice } : undefined,
        newValue: { hasInvoice: patch.hasInvoice },
        description: `${userName} ${patch.hasInvoice ? "włączył" : "wyłączył"} rozliczenie podatkowe kosztu ${nazwa}`,
      });
    } else if (patch.vatRate !== undefined && stary) {
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

  function czyRozliczanyPodatkowo(wpis: KosztVatInfo) {
    return wpis.documentStatus === "brak"
      ? false
      : wpis.hasInvoice ?? ustawienia.defaultCostHasInvoice;
  }

  function zmienStatusDokumentu(
    id: string,
    nazwa: string,
    status: DocumentStatus,
    typ: "tankowanie" | "inne",
    stary?: KosztVatInfo
  ) {
    const patch: Partial<KosztVatInfo> = {
      documentStatus: status,
      hasInvoice: status !== "brak",
    };
    if (typ === "tankowanie") updateTankowanie(id, patch);
    else updateInny(id, patch);

    logChange({
      workspaceId: token,
      userName,
      action: "koszt_dokument_status",
      entity: "cost",
      entityId: id,
      oldValue: { documentStatus: statusDokumentu(stary ?? {}) },
      newValue: { documentStatus: status, hasInvoice: patch.hasInvoice },
      description: `${userName} zmienił dokument kosztu ${nazwa}: ${STATUSY_DOKUMENTU.find((s) => s.id === status)?.label}`,
      url: `/admin?miesiac=${miesiac}&zakladka=koszty`,
    });
  }

  async function dodajZalacznik(
    id: string,
    nazwa: string,
    file: File,
    zalacznikTyp: KosztZalacznik["typ"],
    kosztTyp: "tankowanie" | "inne"
  ) {
    try {
      const zalacznik = await fileToZalacznik(file, zalacznikTyp);
      const lista = kosztTyp === "tankowanie" ? dane.tankowanie : dane.inneKoszty;
      const wpis = lista.find((w) => w.id === id);
      const next = [...(wpis?.zalaczniki ?? []), zalacznik];
      const patch: Partial<KosztVatInfo> = { zalaczniki: next };
      if (kosztTyp === "tankowanie") updateTankowanie(id, patch);
      else updateInny(id, patch);

      logChange({
        workspaceId: token,
        userName,
        action: "koszt_zalacznik_dodany",
        entity: "cost",
        entityId: id,
        newValue: { typ: zalacznikTyp, nazwa: file.name },
        description: `${userName} dodał załącznik do kosztu ${nazwa}: ${zalacznikTyp === "licznik" ? "licznik" : "dokument"}`,
        url: `/admin?miesiac=${miesiac}&zakladka=koszty`,
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Nie udało się dodać załącznika");
    }
  }

  function usunZalacznik(
    id: string,
    zalacznikId: string,
    kosztTyp: "tankowanie" | "inne"
  ) {
    const lista = kosztTyp === "tankowanie" ? dane.tankowanie : dane.inneKoszty;
    const wpis = lista.find((w) => w.id === id);
    const usuwany = (wpis?.zalaczniki ?? []).find((z) => z.id === zalacznikId);
    const next = (wpis?.zalaczniki ?? []).filter((z) => z.id !== zalacznikId);
    const patch: Partial<KosztVatInfo> = { zalaczniki: next };
    if (kosztTyp === "tankowanie") updateTankowanie(id, patch);
    else updateInny(id, patch);

    // Sprzątanie pliku w Storage (best-effort; nie blokuje usunięcia z danych)
    if (usuwany?.storagePath) {
      fetch("/api/attachments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: usuwany.storagePath }),
      }).catch(() => {});
    }
  }

  // ─── AUTO-BACKFILL KATEGORII ────────────────────────────────────────────────
  // Istniejące koszty bez przypisanej kategorii (kategoriaZrodlo === undefined)
  // kategoryzujemy automatycznie: reguły od ręki (jeden batch), reszta → AI w tle.
  // Ręcznie ustawiona kategoria (manual/rule/ai) NIE jest ruszana.
  useEffect(() => {
    type Reg = { id: string; kategoria: KategoriaKosztu; typ: "tankowanie" | "inne" };
    const reguly: Reg[] = [];
    const doAI: { id: string; nazwa: string; koszt: number; data: string }[] = [];

    // Wpis idzie do AI po kategorię I stawkę VAT, dopóki nie zrobiło tego AI
    // ani admin. To znaczy: pomijamy tylko gdy kategoria lub VAT pochodzą z AI
    // albo zostały ustawione ręcznie (manual). Koszty „z reguły" są ponawiane,
    // żeby AI dobrało im właściwą stawkę VAT (nie zawsze 23%).
    const wymagaAI = (k: KosztVatInfo) => {
      if (k.kategoriaZrodlo === "manual" || k.vatZrodlo === "manual") return false;
      if (k.kategoriaZrodlo === "ai" || k.vatZrodlo === "ai") return false;
      return true;
    };

    // Tankowanie zostaje regułą (paliwo/AdBlue = zawsze 23%, odliczenie z ustawień)
    for (const t of dane.tankowanie ?? []) {
      if (backfillDone.current.has(t.id)) continue;
      if ((t.kategoria ?? "inne") === "paliwo_adblue" && t.kategoriaZrodlo) continue;
      backfillDone.current.add(t.id);
      reguly.push({ id: t.id, kategoria: "paliwo_adblue", typ: "tankowanie" });
    }
    // Inne koszty → AI dobiera kategorię i VAT dla każdego
    for (const k of dane.inneKoszty ?? []) {
      if (backfillDone.current.has(k.id)) continue;
      if (!k.nazwa?.trim() || !wymagaAI(k)) continue;
      backfillDone.current.add(k.id);
      doAI.push({ id: k.id, nazwa: k.nazwa, koszt: k.koszt, data: k.data });
    }

    // Reguły — jeden batch (natychmiast, bez sieci)
    if (reguly.length) {
      onUpdate((prev) => {
        let nt = prev.tankowanie;
        let ni = prev.inneKoszty;
        for (const r of reguly) {
          const patch = {
            kategoria: r.kategoria,
            kategoriaZrodlo: "rule" as const,
            vatZrodlo: "rule" as const,
            ...domyslnyVatKategorii(r.kategoria, ustawienia),
          };
          if (r.typ === "tankowanie") nt = nt.map((x) => (x.id === r.id ? { ...x, ...patch } : x));
          else ni = ni.map((x) => (x.id === r.id ? { ...x, ...patch } : x));
        }
        return { ...prev, tankowanie: nt, inneKoszty: ni };
      });
    }

    // Niedopasowane → AI sekwencyjnie w tle (bez klucza serwer zwróci 'inne')
    if (doAI.length) {
      (async () => {
        for (const c of doAI) {
          await autoKategoryzuj(c.id, c.nazwa, c.koszt, c.data, "inne");
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dane.tankowanie, dane.inneKoszty]);

  // Stare wpisy z JSONB nie miały pola paidBy. Uzupełniamy je raz na miesiąc,
  // żeby rozliczenie Artur/Damian/Firma nie miało pustych wartości.
  useEffect(() => {
    if (payerBackfillDone.current.has(miesiac)) return;
    const needsBackfill =
      (dane.tankowanie ?? []).some((t) => !t.paidBy) ||
      (dane.inneKoszty ?? []).some((k) => !k.paidBy);
    payerBackfillDone.current.add(miesiac);
    if (!needsBackfill) return;
    onUpdate((prev) => ({
      ...prev,
      tankowanie: (prev.tankowanie ?? []).map((t) => ({
        ...t,
        paidBy: normalizePayer(t.paidBy),
      })),
      inneKoszty: (prev.inneKoszty ?? []).map((k) => ({
        ...k,
        paidBy: normalizePayer(k.paidBy),
      })),
    }));
  }, [dane.tankowanie, dane.inneKoszty, miesiac, onUpdate]);

  const allDays = getDniMiesiaca(miesiac);
  const {
    dniowki,
    wynagrodzenie,
    liczbaSobot,
    premia,
    wolneBezplatneRobocze,
    dodatkiZablokowaneOdLipca,
  } = obliczWynagrodzenie(miesiac, dane.dni);

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
      // Przyjęcie = wpisz proponowaną liczbę kółek do dnia.
      // Jeśli dzień był wolny/urlop/L4, przywróć go na „pracujący", bo inaczej
      // obliczDniowke zwraca 0 i przyjęte kółka nie zostałyby wypłacone.
      const noweDni =
        przyjmij && z.kolkaProponowane !== undefined
          ? {
              ...prev.dni,
              [z.dzien]: {
                ...(prev.dni[z.dzien] ?? { data: z.dzien, kolka: 0, szkolenie: 0 }),
                kolka: z.kolkaProponowane,
                dayType: "pracujacy" as const,
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

  const patchDzien = useCallback(
    (iso: string, patch: Partial<DzienKierowcy>) => {
      onUpdate((prev) => ({
        ...prev,
        dni: {
          ...prev.dni,
          [iso]: { ...(prev.dni[iso] ?? { data: iso, kolka: 0, szkolenie: 0 }), ...patch },
        },
      }));
    },
    [onUpdate]
  );

  // Typ dnia: wolne/urlop/L4 zerują wszystko; Z zeruje trasy; P zeruje zlecenia
  function setDayType(iso: string, dayType: DayType) {
    const stary = dane.dni[iso]?.dayType ?? "pracujacy";
    if (stary === dayType) return;
    onUpdate((prev) => {
      const base = prev.dni[iso] ?? { data: iso, kolka: 0, szkolenie: 0 };
      const bezTras = !maKolka(dayType); // wolne/urlop/L4/Z
      const bezZlecen = !maZlecenia(dayType); // P/wolne/urlop/L4
      return {
        ...prev,
        dni: {
          ...prev.dni,
          [iso]: {
            ...base,
            dayType,
            kolka: bezTras ? 0 : base.kolka,
            szkolenie: bezTras ? 0 : base.szkolenie,
            zlecenia: bezZlecen ? 0 : base.zlecenia,
          },
        },
      };
    });
    logChange({
      workspaceId: token,
      userName,
      action: "typ_dnia",
      entity: "driver_day",
      entityId: iso,
      oldValue: { dayType: stary },
      newValue: { dayType },
      description: `${userName} ustawił dzień ${iso.slice(8)}.${String(miesiac).padStart(2, "0")} jako ${TYP_DNIA_LABEL[dayType]}`,
    });
  }

  function startDayEdit(iso: string, field: "kolka" | "szkolenie", value: number) {
    dayEditStart.current[`${iso}:${field}`] = parseNum(value);
  }

  function finishDayEdit(iso: string, field: "kolka" | "szkolenie", value: number) {
    const key = `${iso}:${field}`;
    const oldValue = dayEditStart.current[key] ?? 0;
    const newValue = parseNum(value);
    delete dayEditStart.current[key];
    if (oldValue === newValue) return;

    const dzienTxt = `${iso.slice(8)}.${String(miesiac).padStart(2, "0")}`;
    const pole = field === "kolka" ? "kółka" : "szkolenie";
    logChange({
      workspaceId: token,
      userName,
      action: "wyplata_zmieniona",
      entity: "payroll_day",
      entityId: iso,
      oldValue: { [field]: oldValue },
      newValue: { [field]: newValue },
      description: `${userName} zaktualizował wypłatę kierowcy: ${dzienTxt} ${pole} ${oldValue} → ${newValue}`,
      url: `/admin?miesiac=${miesiac}&zakladka=koszty`,
    });
  }

  // ─── TANKOWANIE ─────────────────────────────────────────────────────────────

  function addTankowanie() {
    onUpdate((prev) => ({
      ...prev,
      tankowanie: [
        ...prev.tankowanie,
        { id: uuidv4(), data: "", koszt: 0, paidBy: "Firma" },
      ],
    }));
    setStronaTank(Math.ceil((dane.tankowanie.length + 1) / KOSZTY_NA_STRONE));
  }

  // Dodanie gotowego kosztu ze skanu paragonu (część B) + audit/push
  function dodajZeSkanu(wpis: WpisInnegoKosztu | WpisTankowania, typ: "inne" | "tankowanie") {
    const wpisZPlatnikiem = { ...wpis, paidBy: normalizePayer(wpis.paidBy) };
    onUpdate((prev) =>
      typ === "tankowanie"
        ? { ...prev, tankowanie: [...prev.tankowanie, wpisZPlatnikiem as WpisTankowania] }
        : { ...prev, inneKoszty: [...prev.inneKoszty, wpisZPlatnikiem as WpisInnegoKosztu] }
    );
    if (typ === "tankowanie") setStronaTank(Math.ceil((dane.tankowanie.length + 1) / KOSZTY_NA_STRONE));
    else setStronaInne(Math.ceil((dane.inneKoszty.length + 1) / KOSZTY_NA_STRONE));
    const nazwa = typ === "tankowanie" ? "paliwo" : (wpis as WpisInnegoKosztu).nazwa;
    logChange({
      workspaceId: token,
      userName,
      action: "koszt_skan",
      entity: "cost",
      entityId: wpis.id,
      newValue: { nazwa, koszt: wpis.koszt, kategoria: wpis.kategoria, vat: wpis.vatRate },
      description: `${userName} dodał koszt ze zdjęcia: ${nazwa} ${formatZlCaly(wpis.koszt)}`,
      url: `/admin?miesiac=${miesiac}&zakladka=koszty`,
    });
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
        { id: uuidv4(), data: "", nazwa: "", koszt: 0, paidBy: "Firma" },
      ],
    }));
    setStronaInne(Math.ceil((dane.inneKoszty.length + 1) / KOSZTY_NA_STRONE));
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
  const leasing = parseNum(dane.leasing);
  const kosztyPodatkowe = useMemo(() => {
    const entries: Array<KosztVatInfo & { koszt: number; domyslna: KategoriaKosztu }> = [
      ...(dane.tankowanie ?? []).map((t) => ({
        ...t,
        kategoria: t.kategoria ?? ("paliwo_adblue" as KategoriaKosztu),
        domyslna: "paliwo_adblue" as KategoriaKosztu,
      })),
      ...(dane.inneKoszty ?? []).map((k) => ({
        ...k,
        domyslna: "inne" as KategoriaKosztu,
      })),
    ];

    return entries.reduce(
      (acc, wpis) => {
        const r = rozbijWpis(wpis, ustawienia, wpis.domyslna);
        acc.brutto += r.brutto;
        acc.netto += r.netto;
        acc.vat += r.vat;
        acc.vatDoOdliczenia += r.vatDoOdliczenia;
        if (statusDokumentu(wpis) === "brak") acc.bezDokumentu += 1;
        return acc;
      },
      { brutto: 0, netto: 0, vat: 0, vatDoOdliczenia: 0, bezDokumentu: 0 }
    );
  }, [dane.tankowanie, dane.inneKoszty, ustawienia]);
  const fuelSummary = useMemo(
    () => buildFuelStats(dane, ustawienia).summary,
    [dane, ustawienia]
  );
  const platnicyKosztow = useMemo(() => {
    const sums: Record<KosztPayer, number> = { Artur: 0, Damian: 0, Firma: 0 };
    const count: Record<KosztPayer, number> = { Artur: 0, Damian: 0, Firma: 0 };
    const rows = [
      ...(dane.tankowanie ?? []),
      ...(dane.inneKoszty ?? []),
    ].filter((x) => parseNum(x.koszt) > 0);

    for (const row of rows) {
      const payer = normalizePayer(row.paidBy);
      sums[payer] += parseNum(row.koszt);
      count[payer] += 1;
    }

    const prywatne = sums.Artur + sums.Damian;
    const polowa = prywatne / 2;
    const diff = Math.round((sums.Artur - polowa) * 100) / 100;
    const rozliczenie =
      Math.abs(diff) < 0.01
        ? "Artur i Damian są rozliczeni po równo."
        : diff > 0
        ? `Damian oddaje Arturowi ${formatZl(diff)}.`
        : `Artur oddaje Damianowi ${formatZl(Math.abs(diff))}.`;

    return { sums, count, prywatne, polowa, diff, rozliczenie, liczba: rows.length };
  }, [dane.tankowanie, dane.inneKoszty]);
  const sumaKosztow = wynagrodzenie + sumaFuel + sumaInne + leasing;
  const glowneKoszty = [
    { label: "Wypłata kierowcy", value: wynagrodzenie, icon: <IconUsers size={16} /> },
    { label: "Paliwo", value: sumaFuel, icon: <IconGasStation size={16} /> },
    { label: "Auto i działalność", value: sumaInne, icon: <IconPackage size={16} /> },
    { label: "Leasing", value: leasing, icon: <IconCar size={16} /> },
  ];
  const najwiekszyKoszt = [...glowneKoszty].sort((a, b) => b.value - a.value)[0];
  const rozkminyKosztow = [
    kosztyPodatkowe.bezDokumentu > 0
      ? `${kosztyPodatkowe.bezDokumentu} koszt${kosztyPodatkowe.bezDokumentu === 1 ? "" : "ów"} nie ma dokumentu — zostaje w wyniku, ale nie pomoże w VAT.`
      : "Dokumenty kosztów wyglądają czysto — brak pozycji bez dokumentu.",
    platnicyKosztow.prywatne > 0 ? platnicyKosztow.rozliczenie : "Brak kosztów prywatnych Artur/Damian do rozliczenia 50/50.",
    fuelSummary.liczbaTankowan > 0
      ? `Paliwo: ${fuelSummary.liczbaTankowan} tankowań, ${formatLitry(fuelSummary.sumaLitrow)}, średnio ${formatZlNaLitr(fuelSummary.sredniaBruttoZaLitr)} brutto.`
      : "Brak tankowań w tym miesiącu.",
  ];
  const showPodsumowanie = widokKosztow === "podsumowanie";
  const showWyplata = widokKosztow === "wyplata";
  const showTankowanie = widokKosztow === "tankowanie";
  const showSamochod = widokKosztow === "samochod";
  const showRozliczenie = widokKosztow === "rozliczenie";
  const showStatystyki = widokKosztow === "statystyki";

  // Paginacja: tyle stron ile trzeba, po KOSZTY_NA_STRONE pozycji.
  // Stronę klampujemy, żeby po usunięciu wpisów nie wisieć na nieistniejącej.
  const tankTotalStron = Math.max(1, Math.ceil(dane.tankowanie.length / KOSZTY_NA_STRONE));
  const tankStrona = Math.min(stronaTank, tankTotalStron);
  const tankowanieWidoczne = dane.tankowanie.slice((tankStrona - 1) * KOSZTY_NA_STRONE, tankStrona * KOSZTY_NA_STRONE);
  const inneTotalStron = Math.max(1, Math.ceil(dane.inneKoszty.length / KOSZTY_NA_STRONE));
  const inneStrona = Math.min(stronaInne, inneTotalStron);
  const inneWidoczne = dane.inneKoszty.slice((inneStrona - 1) * KOSZTY_NA_STRONE, inneStrona * KOSZTY_NA_STRONE);

  // Numer tygodnia rośnie przy każdym poniedziałku (poza pierwszym dniem)
  let weekNum = 1;

  return (
    <div className="space-y-4">
      <KosztySectionSwitch active={widokKosztow} onChange={setWidokKosztow} />

      {showPodsumowanie && <Card className="!border-amber-brand/35">
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-brand/35 bg-amber-brand/10 text-amber-brand">
            <IconMoneybag size={21} />
          </span>
          <div className="min-w-0">
            <CardTitle className="mb-1">Podsumowanie kosztów</CardTitle>
            <p className="text-xs text-dim">
              Cały miesiąc w jednym miejscu: koszty, dokumenty, VAT i rozliczenie Artur/Damian.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface2 p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-dim">
            Razem koszty miesiąca
          </p>
          <p className="mt-1 tabular-nums text-3xl font-extrabold text-white">
            {formatZl(sumaKosztow)}
          </p>
          <p className="mt-1 text-[11px] text-dim">
            wypłata + paliwo + auto/działalność + leasing
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <KosztyMetricCard
            icon={<IconChartBar size={17} />}
            label="Netto z dokumentów"
            value={formatZl(kosztyPodatkowe.netto)}
            hint="koszty z faktur/paragonów"
          />
          <KosztyMetricCard
            icon={<IconCheck size={17} />}
            label="VAT do odliczenia"
            value={formatZl(kosztyPodatkowe.vatDoOdliczenia)}
            tone="green"
          />
          <KosztyMetricCard
            icon={<IconAlertTriangle size={17} />}
            label="Bez dokumentu"
            value={`${kosztyPodatkowe.bezDokumentu}`}
            hint="nie pomaga w VAT"
            tone={kosztyPodatkowe.bezDokumentu > 0 ? "red" : "green"}
          />
          <KosztyMetricCard
            icon={najwiekszyKoszt.icon}
            label="Największy koszt"
            value={formatZl(najwiekszyKoszt.value)}
            hint={najwiekszyKoszt.label}
            tone="amber"
          />
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-dim">
            Rozbicie kosztów
          </p>
          {glowneKoszty.map((row) => (
            <div key={row.label} className="flex items-center gap-2 rounded-xl border border-line/70 bg-surface2/70 px-3 py-2">
              <span className="text-amber-brand">{row.icon}</span>
              <span className="min-w-0 flex-1 text-sm text-dim">{row.label}</span>
              <span className="tabular-nums text-sm font-bold text-white">{formatZl(row.value)}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-line bg-surface2/70 p-3">
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-dim">
            Kto zapłacił
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            {PAYER_OPTIONS.map((payer) => (
              <div key={payer.id} className="rounded-xl border border-line bg-input px-2 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-dim">{payer.label}</p>
                <p className="mt-1 tabular-nums text-sm font-extrabold text-white">
                  {formatZl(platnicyKosztow.sums[payer.id])}
                </p>
                <p className="text-[10px] text-dim/70">{platnicyKosztow.count[payer.id]} poz.</p>
              </div>
            ))}
          </div>
          <p className="mt-3 rounded-xl border border-amber-brand/30 bg-amber-brand/10 px-3 py-2 text-xs font-bold text-amber-brand">
            {platnicyKosztow.rozliczenie}
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-green-500/25 bg-green-soft/60 p-3">
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-green-300">
            Moja rozkmina
          </p>
          <ul className="space-y-1.5 text-xs leading-relaxed text-dim">
            {rozkminyKosztow.map((txt) => (
              <li key={txt} className="flex gap-2">
                <span className="mt-0.5 text-green-300">✓</span>
                <span>{txt}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setWidokKosztow("wyplata")}
            className="rounded-xl border border-line bg-surface2 px-3 py-2 text-xs font-bold text-dim hover:text-ink"
          >
            Wypłata
          </button>
          <button
            type="button"
            onClick={() => setWidokKosztow("tankowanie")}
            className="rounded-xl border border-line bg-surface2 px-3 py-2 text-xs font-bold text-dim hover:text-ink"
          >
            Tankowanie
          </button>
          <button
            type="button"
            onClick={() => setWidokKosztow("rozliczenie")}
            className="rounded-xl border border-line bg-surface2 px-3 py-2 text-xs font-bold text-dim hover:text-ink"
          >
            50/50
          </button>
          <button
            type="button"
            onClick={() => setWidokKosztow("samochod")}
            className="rounded-xl border border-line bg-surface2 px-3 py-2 text-xs font-bold text-dim hover:text-ink"
          >
            Auto
          </button>
        </div>
      </Card>}

      {/* ── SEKCJA: ZGŁOSZENIA KIEROWCY ──────────────────────────────────── */}
      {oczekujace.length > 0 && (showPodsumowanie || showWyplata) && (
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

      {/* ── PODKATEGORIA: WYPŁATA KIEROWCY ──────────────────────────────── */}
      {showWyplata && <Card>
        <CardTitle>Wypłata kierowcy</CardTitle>
        <p className="mb-3 text-xs text-dim">
          Dniówki, kółka, zlecenia, premie i dodatki kierowcy.
        </p>

        {/* Legenda skrótów typów dnia */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px] text-dim">
          {TYPY_DNIA.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1">
              <span className={cn("rounded-full border px-1.5 py-0.5 font-bold leading-none", t.chipCls)}>
                {t.krotki}
              </span>
              <span>= {t.label}</span>
            </span>
          ))}
        </div>

        {/* Nagłówek kolumn */}
        <div className={cn(
          "hidden gap-2 text-xs font-bold uppercase tracking-wide text-dim mb-2 px-2 sm:grid",
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
            const typDnia = dzien.dayType ?? "pracujacy";
            const wolny = czyWolny(typDnia);
            const dzienMaKolka = maKolka(typDnia);
            const dzienMaZlecenia = maZlecenia(typDnia);
            const meta = typDniaMeta(typDnia);

            const separator =
              dayIdx > 0 && getDayOfWeek(iso) === 1 ? <WeekSeparator n={++weekNum} /> : null;

            return (
              <div key={iso}>
                {separator}
                <div
                  className={cn(
                    "space-y-3 rounded-2xl border border-line/70 bg-surface2/55 p-3 sm:hidden",
                    sporny && "ring-1 ring-amber-brand",
                    aktywna && sob && "border-green-500/35",
                    aktywna && nie && "border-yellow-500/35"
                  )}
                  style={
                    sob && aktywna
                      ? { background: "var(--sat-bg)" }
                      : nie && aktywna
                      ? { background: "var(--sun-bg)" }
                      : undefined
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-xl font-extrabold tabular-nums", aktywna && (sob || nie) ? "text-white" : "text-ink")}>
                          {nrDnia(iso)}
                        </span>
                        <span className={cn(
                          "text-sm font-bold",
                          aktywna && (sob || nie)
                            ? "text-white/75"
                            : sob ? "text-green-400" : nie ? "text-yellow-400" : "text-dim"
                        )}>
                          {nazwaSkrotDnia(iso)}
                        </span>
                      </div>
                      <select
                        value={typDnia}
                        onChange={(e) => setDayType(iso, e.target.value as DayType)}
                        title="Typ dnia"
                        className={cn("mt-2 min-h-[38px] rounded-full border px-3 py-1.5 text-sm font-extrabold", meta.chipCls)}
                      >
                        {TYPY_DNIA.map((t) => (
                          <option key={t.id} value={t.id}>{t.krotki} — {t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-white/55">Dniówka</p>
                      {info?.dniowka ? (
                        <p className="tabular-nums text-xl font-extrabold text-white">
                          {formatZlCaly(info.dniowka)}
                        </p>
                      ) : (
                        <p className="text-lg font-bold text-dim/50">—</p>
                      )}
                    </div>
                  </div>

                  <div className={cn("grid gap-2", miesiac === 6 ? "grid-cols-2" : "grid-cols-1")}>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-dim">
                      Kółka
                      {wolny ? (
                        <span className={cn("mt-1 flex min-h-[44px] items-center justify-center rounded-xl border px-3 text-sm font-extrabold", meta.chipCls)}>
                          {meta.krotki}
                        </span>
                      ) : dzienMaKolka ? (
                        <NumInput
                          value={dzien.kolka || ""}
                          onChange={(v) => setKolka(iso, v)}
                          onFocus={() => startDayEdit(iso, "kolka", dzien.kolka)}
                          onBlur={(e) => finishDayEdit(iso, "kolka", parseNum(e.currentTarget.value))}
                          placeholder="0"
                          className="mt-1 !text-center !text-lg"
                        />
                      ) : (
                        <span className="mt-1 flex min-h-[44px] items-center justify-center rounded-xl border border-line bg-input text-dim/50">
                          —
                        </span>
                      )}
                    </label>

                    {miesiac === 6 && (
                      <label className="text-[11px] font-bold uppercase tracking-wider text-dim">
                        Szkolenie
                        {dzienMaKolka ? (
                          <NumInput
                            value={dzien.szkolenie || ""}
                            onChange={(v) => setSzkolenie(iso, v)}
                            onFocus={() => startDayEdit(iso, "szkolenie", dzien.szkolenie)}
                            onBlur={(e) => finishDayEdit(iso, "szkolenie", parseNum(e.currentTarget.value))}
                            placeholder="0"
                            className="mt-1 !text-center !text-lg"
                          />
                        ) : (
                          <span className="mt-1 flex min-h-[44px] items-center justify-center rounded-xl border border-line bg-input text-dim/50">
                            —
                          </span>
                        )}
                      </label>
                    )}
                  </div>
                </div>

                <div
                  className={cn(
                    "hidden gap-2 items-center rounded-xl py-1.5 px-2 sm:grid",
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
                  {/* Data + typ dnia */}
                  <div className="text-sm tabular-nums flex items-center gap-1.5 flex-wrap">
                    <span className={cn("font-bold", aktywna && (sob || nie) ? "text-white" : "text-ink")}>
                      {nrDnia(iso)}
                    </span>
                    <span className={cn(
                      "text-xs",
                      aktywna && (sob || nie)
                        ? "text-white/70"
                        : sob ? "text-green-400" : nie ? "text-yellow-400" : "text-dim"
                    )}>
                      {nazwaSkrotDnia(iso)}
                    </span>
                    <select
                      value={typDnia}
                      onChange={(e) => setDayType(iso, e.target.value as DayType)}
                      title="Typ dnia"
                      className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-bold", meta.chipCls)}
                    >
                      {TYPY_DNIA.map((t) => (
                        <option key={t.id} value={t.id}>{t.krotki}</option>
                      ))}
                    </select>
                  </div>

                  {/* Kółka — input dla P/P+Z; chip dla wolnych; „—" dla samego Z */}
                  {wolny ? (
                    <span className={cn("flex items-center justify-center rounded-lg border px-1 py-1.5 text-[10px] font-bold !w-16", meta.chipCls)}>
                      {meta.krotki}
                    </span>
                  ) : dzienMaKolka ? (
                    <NumInput
                      value={dzien.kolka || ""}
                      onChange={(v) => setKolka(iso, v)}
                      onFocus={() => startDayEdit(iso, "kolka", dzien.kolka)}
                      onBlur={(e) => finishDayEdit(iso, "kolka", parseNum(e.currentTarget.value))}
                      placeholder="0"
                      className="!py-1.5 !px-2 !text-sm !text-center !w-16"
                    />
                  ) : (
                    <span className="flex items-center justify-center text-dim/40 text-sm !w-16" title="tylko zlecenia">—</span>
                  )}

                  {/* Szkolenie (tylko czerwiec, dni z trasami) */}
                  {miesiac === 6 && (
                    dzienMaKolka ? (
                      <NumInput
                        value={dzien.szkolenie || ""}
                        onChange={(v) => setSzkolenie(iso, v)}
                        onFocus={() => startDayEdit(iso, "szkolenie", dzien.szkolenie)}
                        onBlur={(e) => finishDayEdit(iso, "szkolenie", parseNum(e.currentTarget.value))}
                        placeholder="0"
                        className="!py-1.5 !px-2 !text-sm !text-center !w-16"
                      />
                    ) : (
                      <span className="flex items-center justify-center text-dim/40 text-sm !w-16">—</span>
                    )
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

                {/* Zlecenia — tylko gdy typ dnia to P+Z lub Z */}
                {dzienMaZlecenia && (() => {
                  const stawka = parseNum(dzien.stawkaZlecenia) || 100;
                  const pokazInna = innaStawka[iso] ?? (stawka !== 50 && stawka !== 100);
                  return (
                    <div className="flex items-center gap-1.5 px-2 pb-1 -mt-0.5 text-[11px] text-dim">
                      <span className="shrink-0">Zlecenia</span>
                      <div className="w-12">
                        <NumInput
                          value={dzien.zlecenia || ""}
                          onChange={(v) => patchDzien(iso, { zlecenia: v })}
                          placeholder="0"
                          className="!py-1 !px-1.5 !text-xs !text-center"
                        />
                      </div>
                      <span>×</span>
                      <select
                        value={pokazInna ? "inna" : String(stawka)}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "inna") {
                            setInnaStawka((p) => ({ ...p, [iso]: true }));
                          } else {
                            setInnaStawka((p) => ({ ...p, [iso]: false }));
                            patchDzien(iso, { stawkaZlecenia: Number(v) });
                          }
                        }}
                        className="bg-input border border-line rounded-lg px-1.5 py-1 text-xs text-ink"
                      >
                        <option value="50">50 zł</option>
                        <option value="100">100 zł</option>
                        <option value="inna">inna</option>
                      </select>
                      {pokazInna && (
                        <div className="w-16">
                          <NumInput
                            value={dzien.stawkaZlecenia || ""}
                            onChange={(v) => patchDzien(iso, { stawkaZlecenia: v })}
                            placeholder="zł"
                            className="!py-1 !px-1.5 !text-xs !text-center"
                          />
                        </div>
                      )}
                      {info && info.kwotaZlecen > 0 && (
                        <span className="ml-auto text-amber-brand font-semibold tabular-nums">
                          +{formatZlCaly(info.kwotaZlecen)}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {/* Liczniki dni wg typu */}
        {(() => {
          const c = liczDniWgTypu(dane.dni);
          return (
            <p className="mt-3 text-xs text-dim flex flex-wrap gap-x-3 gap-y-1">
              <span>Pracujące: <b className="text-ink">{c.pracujace}</b></span>
              <span>Wolne: <b className="text-zinc-300">{c.wolne}</b></span>
              <span>Urlop: <b className="text-blue-300">{c.urlop}</b></span>
              <span>L4: <b className="text-purple-300">{c.chorobowe}</b></span>
            </p>
          );
        })()}

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
          {miesiac >= 7 && (
            <div className="flex justify-between text-sm">
              <span className={dodatkiZablokowaneOdLipca ? "text-red-300" : "text-dim"}>
                Wolne bezpłatne Pon–Pt
              </span>
              <span className={cn("tabular-nums", dodatkiZablokowaneOdLipca ? "text-red-300" : "text-ink")}>
                {wolneBezplatneRobocze} / 2
              </span>
            </div>
          )}
          {premia > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-amber-brand">Premia (≥4 soboty)</span>
              <span className="tabular-nums text-amber-brand">+ {formatZlCaly(premia)}</span>
            </div>
          )}
          {dodatkiZablokowaneOdLipca && (
            <div className="rounded-lg border border-red-500/35 bg-red-soft px-2.5 py-2 text-xs text-red-200">
              Od lipca 2 dni wolnego bezpłatnego Pon–Pt blokują premię 200 zł i dodatek niedzielny 250 zł.
            </div>
          )}
          <div className="flex justify-between font-bold pt-2 border-t border-line">
            <span className="text-white">Łącznie</span>
            <span className="tabular-nums text-white text-lg">{formatZlCaly(wynagrodzenie)}</span>
          </div>
        </div>
      </Card>}

      {/* ── PODKATEGORIA: TANKOWANIE ────────────────────────────────────── */}
      {showTankowanie && <Card>
        <CardTitle>Tankowanie</CardTitle>
        <p className="mb-3 text-xs text-dim">
          Paliwo, AdBlue oraz faktury/paragony za tankowanie.
        </p>
        <div className="space-y-2">
          {tankowanieWidoczne.map((t) => (
            <div key={t.id} className="rounded-xl border border-line/60 p-2 space-y-1.5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-center">
                <DatePill
                  value={t.data}
                  onChange={(v) => updateTankowanie(t.id, { data: v })}
                />
                <div className="min-w-0">
                  <NumInput
                    value={t.koszt}
                    onChange={(v) => updateTankowanie(t.id, { koszt: v })}
                    onBlur={() => pushKoszt(t.id, "paliwo", t.koszt, { ...t, kategoria: t.kategoria ?? "paliwo_adblue" })}
                    placeholder="0"
                  />
                </div>
                <PayerSelect
                  value={t.paidBy}
                  onChange={(paidBy) => updateTankowanie(t.id, { paidBy })}
                  compact
                  className="col-span-2 sm:col-span-1"
                />
                <div className="col-span-2 flex justify-end gap-1 sm:col-span-1">
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
              </div>
              {(t.litry || t.dodaneBy) && (
                <p className="mt-1 text-[11px] text-dim flex items-center gap-1.5 flex-wrap">
                  {t.litry ? <span className="tabular-nums">{t.litry} l</span> : null}
                  {t.dodaneBy ? (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-brand/10 border border-amber-brand/30 text-amber-brand">
                      od kierowcy: {t.dodaneBy}
                    </span>
                  ) : null}
                </p>
              )}
              <VatMiniInfo
                wpis={{ ...t, kategoria: t.kategoria ?? "paliwo_adblue" }}
                ustawienia={ustawienia}
                domyslnaKategoria="paliwo_adblue"
              />
              <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:flex sm:flex-wrap sm:items-center">
                <RozliczeniePodatkoweButton
                  checked={czyRozliczanyPodatkowo(t)}
                  onClick={() => {
                    const patch = { hasInvoice: !czyRozliczanyPodatkowo(t) };
                    updateTankowanie(t.id, patch);
                    logVatPatch("paliwo", t.id, patch, t);
                  }}
                />
                <DokumentyKosztu
                  wpis={t}
                  showLicznik
                  onStatus={(status) => zmienStatusDokumentu(t.id, "paliwo", status, "tankowanie", t)}
                  onAdd={(file, typ) => dodajZalacznik(t.id, "paliwo", file, typ, "tankowanie")}
                  onRemove={(zalacznikId) => usunZalacznik(t.id, zalacznikId, "tankowanie")}
                />
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
        <Pager strona={tankStrona} total={tankTotalStron} onZmiana={setStronaTank} />
        <button
          onClick={addTankowanie}
          className="mt-3 w-full py-2.5 min-h-[44px] rounded-xl border border-dashed border-amber-brand/50 text-sm text-amber-brand hover:bg-amber-brand/10 transition-all duration-150"
        >
          + Dodaj tankowanie
        </button>
        <SkanParagonu
          typ="tankowanie"
          ustawienia={ustawienia}
          onZapisz={(w) => dodajZeSkanu(w, "tankowanie")}
        />
        {dane.tankowanie.length > 0 && (
          <div className="flex items-center gap-2 mt-3 rounded-2xl bg-surface2 border border-line px-4 py-3">
            <IconGasStation size={18} className="text-amber-brand" />
            <span className="text-sm text-dim flex-1">Suma paliwo</span>
            <span className="tabular-nums text-white font-bold">{formatZlCaly(sumaFuel)}</span>
          </div>
        )}
      </Card>}

      {showStatystyki && (
        <FuelStatsPanel dane={dane} ustawienia={ustawienia} miesiac={miesiac} />
      )}

      {showRozliczenie && (
        <RozliczenieKosztowPanel
          dane={dane}
          ustawienia={ustawienia}
          miesiac={miesiac}
        />
      )}

      {/* ── PODKATEGORIA: SAMOCHÓD I DZIAŁALNOŚĆ ────────────────────────── */}
      {showSamochod && <Card>
        <CardTitle>Samochód i działalność</CardTitle>
        <p className="mb-3 text-xs text-dim">
          Części, serwis, naprawy, opłaty, internet, telefon, wyposażenie i inne koszty firmowe.
        </p>
        <div className="space-y-2">
          {inneWidoczne.map((k) => (
            <div key={k.id} className="rounded-xl border border-line/60 p-2 space-y-1.5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[auto_minmax(0,1fr)_112px_auto_auto] sm:items-center">
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
                  className="col-span-2 min-w-0 bg-input border border-line rounded-[10px] px-3 py-2 text-[15px] text-ink placeholder:text-dim/50 sm:col-span-1"
                />
                <div className="min-w-0">
                  <NumInput
                    value={k.koszt}
                    onChange={(v) => updateInny(k.id, { koszt: v })}
                    onBlur={() => pushKoszt(k.id, k.nazwa || "inny", k.koszt, k)}
                    placeholder="0"
                  />
                </div>
                <PayerSelect
                  value={k.paidBy}
                  onChange={(paidBy) => updateInny(k.id, { paidBy })}
                  compact
                  className="min-w-0"
                />
                <div className="col-span-2 flex justify-end gap-1 sm:col-span-1">
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
              </div>

              {/* Kategoria + ostrzeżenia + zatwierdzanie AI */}
              <div className="grid grid-cols-1 gap-1.5">
                <KategoriaBadge
                  wpis={k}
                  onZmienKategorie={(nowa) =>
                    zmienKategorie(k.id, k.nazwa || "inny", k.kategoria, nowa, "inne")
                  }
                  onZatwierdzAI={() => zatwierdzAI(k.id, k.nazwa || "inny", "inne")}
                  onAuto={() => autoKategoryzuj(k.id, k.nazwa, k.koszt, k.data, "inne", true)}
                  autoBusy={autoBusyId === k.id}
                />
                <VatMiniInfo wpis={k} ustawienia={ustawienia} />
                <div className="grid grid-cols-1 gap-1.5 sm:flex sm:flex-wrap sm:items-center">
                  <RozliczeniePodatkoweButton
                    checked={czyRozliczanyPodatkowo(k)}
                    onClick={() => {
                      const patch = { hasInvoice: !czyRozliczanyPodatkowo(k) };
                      updateInny(k.id, patch);
                      logVatPatch(k.nazwa || "inny", k.id, patch, k);
                    }}
                  />
                  <DokumentyKosztu
                    wpis={k}
                    onStatus={(status) => zmienStatusDokumentu(k.id, k.nazwa || "inny", status, "inne", k)}
                    onAdd={(file, typ) => dodajZalacznik(k.id, k.nazwa || "inny", file, typ, "inne")}
                    onRemove={(zalacznikId) => usunZalacznik(k.id, zalacznikId, "inne")}
                  />
                </div>
              </div>

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
        <Pager strona={inneStrona} total={inneTotalStron} onZmiana={setStronaInne} />
        <button
          onClick={addInny}
          className="mt-3 w-full py-2.5 min-h-[44px] rounded-xl border border-dashed border-amber-brand/50 text-sm text-amber-brand hover:bg-amber-brand/10 transition-all duration-150"
        >
          + Dodaj koszt
        </button>
        <SkanParagonu
          typ="inne"
          ustawienia={ustawienia}
          onZapisz={(w) => dodajZeSkanu(w, "inne")}
        />
        {dane.inneKoszty.length > 0 && (
          <div className="flex items-center gap-2 mt-3 rounded-2xl bg-surface2 border border-line px-4 py-3">
            <IconPackage size={18} className="text-amber-brand" />
            <span className="text-sm text-dim flex-1">Suma samochód i działalność</span>
            <span className="tabular-nums text-white font-bold">{formatZlCaly(sumaInne)}</span>
          </div>
        )}
      </Card>}

      {/* ── SEKCJA: LEASING ──────────────────────────────────────────────── */}
      {showSamochod && <Card>
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
      </Card>}

      {/* Info o domyślnym traktowaniu kosztów */}
      <p className="text-[11px] text-dim/60 text-center px-4">
        Domyślnie koszty są rozliczane podatkowo. Jeśli nie masz faktury/paragonu do rozliczenia,
        wyłącz „Rozlicz podatkowo” w szczegółach VAT — koszt zostanie w wyniku, ale bez VAT i podatku dochodowego.
      </p>

      <button
        type="button"
        onClick={() => setQuickActionsOpen(true)}
        className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-brand text-amber-ink shadow-2xl transition-transform active:scale-95 sm:hidden"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 5.75rem)" }}
        aria-label="Szybkie dodawanie"
      >
        <IconPlus size={26} />
      </button>

      {quickActionsOpen && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <button
            type="button"
            aria-label="Zamknij szybkie akcje"
            className="absolute inset-0 bg-black/55"
            onClick={() => setQuickActionsOpen(false)}
          />
          <div
            className="absolute inset-x-3 mx-auto max-w-[480px] rounded-3xl border border-line bg-surface p-3 shadow-2xl animate-fade-in"
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 5.25rem)" }}
          >
            <p className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-dim">
              Szybkie dodawanie
            </p>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => {
                  setWidokKosztow("tankowanie");
                  addTankowanie();
                  setQuickActionsOpen(false);
                }}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface2 px-4 py-3 text-left font-bold text-ink"
              >
                <IconGasStation size={20} className="text-amber-brand" />
                Dodaj tankowanie
              </button>
              <button
                type="button"
                onClick={() => {
                  setWidokKosztow("samochod");
                  addInny();
                  setQuickActionsOpen(false);
                }}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface2 px-4 py-3 text-left font-bold text-ink"
              >
                <IconPackage size={20} className="text-amber-brand" />
                Dodaj koszt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-surface border border-green-500/40 text-green-300 text-sm font-medium shadow-2xl animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
