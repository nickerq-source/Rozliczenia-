"use client";

// Szczegóły faktury/VAT kosztu: badge kategorii (select), ostrzeżenia,
// rozwijany panel z polami faktury, trybem netto/brutto, stawką VAT,
// odliczeniem oraz wyliczonym rozbiciem (netto / VAT / do odliczenia / koszt podatkowy).

import {
  KategoriaKosztu,
  KosztVatInfo,
  UstawieniaPodatkowe,
  VatRate,
} from "@/lib/types";
import {
  KATEGORIE,
  kategoriaLabel,
  domyslnyVatKategorii,
  rozbijWpis,
} from "@/lib/tax";
import { formatZl } from "@/lib/business-logic";
import { IconAlertTriangle, IconCheck, IconLoader } from "./ui/icons";
import { cn } from "@/lib/utils";

const STAWKI_VAT: { id: VatRate; label: string }[] = [
  { id: "0.23", label: "23%" },
  { id: "0.08", label: "8%" },
  { id: "0.05", label: "5%" },
  { id: "0", label: "0%" },
  { id: "zw", label: "zw." },
  { id: "np", label: "np." },
];

export function vatRateLabel(rate: VatRate): string {
  return STAWKI_VAT.find((s) => s.id === rate)?.label ?? rate;
}

function zrodloLabel(z: KosztVatInfo["kategoriaZrodlo"]): string {
  if (z === "rule") return "reguła";
  if (z === "ai") return "AI";
  return "ręcznie";
}

// ─── BADGE KATEGORII + OSTRZEŻENIA ───────────────────────────────────────────

export function KategoriaBadge({
  wpis,
  onZmienKategorie,
  onZatwierdzAI,
  onAuto,
  autoBusy,
}: {
  wpis: KosztVatInfo;
  onZmienKategorie: (k: KategoriaKosztu) => void;
  onZatwierdzAI?: () => void;
  onAuto?: () => void;
  autoBusy?: boolean;
}) {
  const kategoria = wpis.kategoria ?? "inne";
  const zAI = wpis.kategoriaZrodlo === "ai" && !wpis.kategoriaPotwierdzona;
  const sprawdzVat = kategoria === "inne" || zAI;
  const sprawdzFirmowy = kategoria === "art_spozywcze";

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <select
        value={kategoria}
        onChange={(e) => onZmienKategorie(e.target.value as KategoriaKosztu)}
        title="Kategoria kosztu"
        className="bg-amber-brand/10 border border-amber-brand/40 rounded-full px-2.5 py-1 text-xs text-amber-brand font-medium"
      >
        {KATEGORIE.map((k) => (
          <option key={k.id} value={k.id}>{k.label}</option>
        ))}
      </select>

      {onAuto && (
        <button
          type="button"
          onClick={onAuto}
          disabled={autoBusy}
          className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[28px] rounded-full bg-amber-brand text-amber-ink text-xs font-extrabold shadow-[0_0_0_1px_rgba(245,165,36,0.35)] hover:bg-[#e09420] disabled:opacity-50 transition-colors"
          title="Automatycznie dobierz kategorię i VAT"
        >
          {autoBusy ? <IconLoader size={11} /> : "↻"}
          Auto VAT
        </button>
      )}

      {sprawdzVat && (
        <span
          className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-soft border border-red-500/40 text-red-300 text-[10px] font-medium"
          title={zAI ? "Kategoria nadana przez AI — potwierdź lub zmień" : "Sprawdź kategorię i stawkę VAT"}
        >
          <IconAlertTriangle size={11} />
          sprawdź kategorię/VAT
        </span>
      )}
      {sprawdzFirmowy && (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-brand/10 border border-amber-brand/40 text-amber-brand text-[10px] font-medium">
          <IconAlertTriangle size={11} />
          sprawdź czy koszt firmowy
        </span>
      )}
      {zAI && onZatwierdzAI && (
        <button
          type="button"
          onClick={onZatwierdzAI}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-soft border border-green-500/40 text-green-300 text-[10px] font-bold hover:bg-green-500/20"
          title={`AI (confidence ${(wpis.kategoriaConfidence ?? 0).toFixed(2)}) — zatwierdź kategorię`}
        >
          <IconCheck size={11} />
          Zatwierdź
        </button>
      )}
    </div>
  );
}

// ─── PANEL SZCZEGÓŁÓW FAKTURY/VAT ────────────────────────────────────────────

interface PanelProps {
  wpis: KosztVatInfo & { koszt: number };
  ustawienia: UstawieniaPodatkowe;
  domyslnaKategoria?: KategoriaKosztu;
  onPatch: (patch: Partial<KosztVatInfo>) => void;
  onAuto?: () => void;
  autoBusy?: boolean;
}

export function KosztSzczegolyPanel({
  wpis,
  ustawienia,
  domyslnaKategoria = "inne",
  onPatch,
  onAuto,
  autoBusy,
}: PanelProps) {
  const kategoria = wpis.kategoria ?? domyslnaKategoria;
  const defVat = domyslnyVatKategorii(kategoria, ustawienia);
  const vatRate = wpis.vatRate ?? defVat.vatRate;
  const vatDeductible = wpis.vatDeductible ?? defVat.vatDeductible;
  const vatPercent = wpis.vatDeductionPercent ?? defVat.vatDeductionPercent;
  const amountMode = wpis.amountMode ?? ustawienia.defaultCostAmountMode;
  const rozliczPodatkowo =
    wpis.documentStatus === "brak"
      ? false
      : wpis.hasInvoice ?? ustawienia.defaultCostHasInvoice;

  const r = rozbijWpis(wpis, ustawienia, domyslnaKategoria);

  const inputCls =
    "bg-input border border-line rounded-lg px-2 py-1.5 text-xs text-ink w-full";
  const selectCls = "bg-input border border-line rounded-lg px-2 py-1.5 text-xs text-ink";

  return (
    <div className="mt-2 rounded-xl bg-surface2 border border-line p-3 space-y-3 text-xs">
      {/* Faktura */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <label className="flex items-center gap-1.5 col-span-2 sm:col-span-3 text-dim">
          <input
            type="checkbox"
            checked={rozliczPodatkowo}
            onChange={(e) => onPatch({ hasInvoice: e.target.checked })}
            className="accent-[#f5a524]"
          />
          Rozlicz podatkowo
        </label>
        {!rozliczPodatkowo && (
          <p className="col-span-2 sm:col-span-3 rounded-lg border border-amber-brand/35 bg-amber-brand/10 px-3 py-2 text-[11px] leading-relaxed text-amber-brand">
            Ten wydatek zostaje w kosztach operacyjnych, ale nie obniża VAT ani podatku dochodowego.
          </p>
        )}
        <input
          type="text"
          value={wpis.invoiceNumber ?? ""}
          onChange={(e) => onPatch({ invoiceNumber: e.target.value || undefined })}
          placeholder="Nr faktury"
          className={inputCls}
        />
        <input
          type="text"
          value={wpis.supplierName ?? ""}
          onChange={(e) => onPatch({ supplierName: e.target.value || undefined })}
          placeholder="Sprzedawca"
          className={inputCls}
        />
        <input
          type="text"
          value={wpis.supplierNip ?? ""}
          onChange={(e) => onPatch({ supplierNip: e.target.value || undefined })}
          placeholder="NIP"
          className={inputCls}
        />
      </div>

      {/* VAT */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={amountMode}
          onChange={(e) => onPatch({ amountMode: e.target.value as "netto" | "brutto" })}
          className={selectCls}
          title="Kwota wpisana jako"
        >
          <option value="brutto">kwota brutto</option>
          <option value="netto">kwota netto</option>
        </select>
        <select
          value={vatRate}
          onChange={(e) => onPatch({ vatRate: e.target.value as VatRate, vatZrodlo: "manual" })}
          className={selectCls}
          title="Stawka VAT"
        >
          {STAWKI_VAT.map((s) => (
            <option key={s.id} value={s.id}>VAT {s.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-dim">
          <input
            type="checkbox"
            checked={vatDeductible}
            onChange={(e) => onPatch({ vatDeductible: e.target.checked, vatZrodlo: "manual" })}
            className="accent-[#f5a524]"
          />
          VAT odliczany
        </label>
        {vatDeductible && (
          <select
            value={vatPercent}
            onChange={(e) => onPatch({ vatDeductionPercent: Number(e.target.value), vatZrodlo: "manual" })}
            className={selectCls}
            title="Procent odliczenia VAT"
          >
            <option value={100}>100%</option>
            <option value={50}>50%</option>
            <option value={0}>0%</option>
          </select>
        )}
        {onAuto && (
          <button
            type="button"
            onClick={onAuto}
            disabled={autoBusy}
            className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-brand/50 text-amber-brand font-medium hover:bg-amber-brand/10 disabled:opacity-50"
            title="Ponowna analiza kategorii i VAT (reguły → AI)"
          >
            {autoBusy ? <IconLoader size={12} /> : "↻"} Auto-kategoria/VAT
          </button>
        )}
      </div>

      {/* Rozbicie */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-1 pt-2 border-t border-line tabular-nums">
        <span className="text-dim">netto<br /><b className="text-ink">{formatZl(r.netto)}</b></span>
        <span className="text-dim">VAT<br /><b className="text-ink">{formatZl(r.vat)}</b></span>
        <span className="text-dim">do odliczenia<br /><b className="text-green-300">{formatZl(r.vatDoOdliczenia)}</b></span>
        <span className="text-dim">brutto<br /><b className="text-ink">{formatZl(r.brutto)}</b></span>
        <span className="text-dim">koszt podatkowy<br /><b className="text-amber-brand">{formatZl(r.kosztPit)}</b></span>
      </div>

      {/* Źródła */}
      <p className="text-[10px] text-dim/70">
        kategoria: {kategoriaLabel(kategoria)} ({zrodloLabel(wpis.kategoriaZrodlo)}
        {wpis.kategoriaZrodlo === "ai" && wpis.kategoriaConfidence !== undefined
          ? `, confidence ${wpis.kategoriaConfidence.toFixed(2)}`
          : ""}
        ) · VAT: {zrodloLabel(wpis.vatZrodlo ?? "rule")}
        {!rozliczPodatkowo ? " · nierozliczane podatkowo" : ""}
        {wpis.taxNote ? ` · ${wpis.taxNote}` : ""}
      </p>
    </div>
  );
}

// ─── PRZEŁĄCZNIK ROZWIJANIA ──────────────────────────────────────────────────

export function SzczegolyToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "shrink-0 px-2 py-1 rounded-lg border text-[10px] font-medium transition-colors",
        open
          ? "border-amber-brand/60 text-amber-brand"
          : "border-line text-dim hover:text-ink"
      )}
      title="Szczegóły faktury/VAT"
    >
      VAT {open ? "▴" : "▾"}
    </button>
  );
}
