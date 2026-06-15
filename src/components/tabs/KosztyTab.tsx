"use client";

// Zakładka Koszty — sekcje: Dni kierowcy, Tankowanie, Inne koszty, Leasing

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  DaneMiesiaca,
  DayType,
  DocumentStatus,
  DzienKierowcy,
  KategoriaKosztu,
  KosztVatInfo,
  KosztZalacznik,
  MiesiącId,
  UstawieniaPodatkowe,
  WpisTankowania,
  WpisInnegoKosztu,
  ZgloszenieDnia,
} from "@/lib/types";
import { kategoriaLabel, domyslnyVatKategorii } from "@/lib/tax";
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
  formatZlCaly,
  parseNum,
  liczDniWgTypu,
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
  IconPaperclip,
} from "../ui/icons";
import { logChange } from "@/lib/audit";
import { SkanParagonu } from "../SkanParagonu";
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

function statusDokumentu(wpis: KosztVatInfo): DocumentStatus {
  if (wpis.documentStatus) return wpis.documentStatus;
  return (wpis.hasInvoice ?? true) ? "faktura" : "brak";
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

  // Podgląd: legacy base64 otwieramy wprost; Storage → krótkotrwały podpisany URL.
  // Okno otwieramy synchronicznie (gest użytkownika), potem ustawiamy adres.
  async function otworzZalacznik(z: KosztZalacznik) {
    if (z.dataUrl) {
      window.open(z.dataUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (!z.storagePath) return;
    const w = window.open("", "_blank", "noopener,noreferrer");
    try {
      const res = await fetch(`/api/attachments/url?path=${encodeURIComponent(z.storagePath)}`);
      const json = (await res.json()) as { url?: string };
      if (res.ok && json.url && w) w.location.href = json.url;
      else w?.close();
    } catch {
      w?.close();
    }
  }

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
        <span
          key={z.id}
          className="inline-flex items-center gap-1 rounded-full bg-surface2 border border-line px-2 py-1 text-[10px] text-dim"
        >
          <button
            type="button"
            onClick={() => otworzZalacznik(z)}
            className="max-w-[92px] truncate hover:text-amber-brand"
            title={z.nazwa}
          >
            {z.typ === "licznik" ? "licznik" : "dokument"} · {z.nazwa}
          </button>
          <button
            type="button"
            onClick={() => onRemove(z.id)}
            className="text-red-300 hover:text-red-200"
            title="Usuń załącznik"
          >
            <IconX size={10} />
          </button>
        </span>
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

export function KosztyTab({ miesiac, dane, onUpdate, token, userName, ustawienia, focusZgloszenieId }: Props) {
  // Rozwinięte panele szczegółów VAT (klucz: id wpisu)
  const [rozwiniete, setRozwiniete] = useState<Record<string, boolean>>({});
  const [autoBusyId, setAutoBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Paginacja list kosztów (1-indeksowana)
  const [stronaTank, setStronaTank] = useState(1);
  const [stronaInne, setStronaInne] = useState(1);
  // Dni, w których stawka zlecenia jest „własna" (nie 50/100)
  const [innaStawka, setInnaStawka] = useState<Record<string, boolean>>({});
  // Id wpisów już objętych automatycznym backfillem (żeby nie powtarzać AI)
  const backfillDone = useRef<Set<string>>(new Set());
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
        { id: uuidv4(), data: "", koszt: 0 },
      ],
    }));
    setStronaTank(Math.ceil((dane.tankowanie.length + 1) / KOSZTY_NA_STRONE));
  }

  // Dodanie gotowego kosztu ze skanu paragonu (część B) + audit/push
  function dodajZeSkanu(wpis: WpisInnegoKosztu | WpisTankowania, typ: "inne" | "tankowanie") {
    onUpdate((prev) =>
      typ === "tankowanie"
        ? { ...prev, tankowanie: [...prev.tankowanie, wpis as WpisTankowania] }
        : { ...prev, inneKoszty: [...prev.inneKoszty, wpis as WpisInnegoKosztu] }
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
        { id: uuidv4(), data: "", nazwa: "", koszt: 0 },
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
      </Card>

      {/* ── SEKCJA: TANKOWANIE ───────────────────────────────────────────── */}
      <Card>
        <CardTitle>Tankowanie</CardTitle>
        <div className="space-y-2">
          {tankowanieWidoczne.map((t) => (
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
                    onBlur={() => pushKoszt(t.id, "paliwo", t.koszt, { ...t, kategoria: t.kategoria ?? "paliwo_adblue" })}
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
              <div className="mt-1.5">
                <RozliczeniePodatkoweButton
                  checked={czyRozliczanyPodatkowo(t)}
                  onClick={() => {
                    const patch = { hasInvoice: !czyRozliczanyPodatkowo(t) };
                    updateTankowanie(t.id, patch);
                    logVatPatch("paliwo", t.id, patch, t);
                  }}
                />
              </div>
              <DokumentyKosztu
                wpis={t}
                showLicznik
                onStatus={(status) => zmienStatusDokumentu(t.id, "paliwo", status, "tankowanie", t)}
                onAdd={(file, typ) => dodajZalacznik(t.id, "paliwo", file, typ, "tankowanie")}
                onRemove={(zalacznikId) => usunZalacznik(t.id, zalacznikId, "tankowanie")}
              />
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
      </Card>

      {/* ── SEKCJA: INNE KOSZTY ──────────────────────────────────────────── */}
      <Card>
        <CardTitle>Inne koszty</CardTitle>
        <div className="space-y-2">
          {inneWidoczne.map((k) => (
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
                    onBlur={() => pushKoszt(k.id, k.nazwa || "inny", k.koszt, k)}
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
                onAuto={() => autoKategoryzuj(k.id, k.nazwa, k.koszt, k.data, "inne", true)}
                autoBusy={autoBusyId === k.id}
              />
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
        Domyślnie koszty są rozliczane podatkowo. Jeśli nie masz faktury/paragonu do rozliczenia,
        wyłącz „Rozlicz podatkowo” w szczegółach VAT — koszt zostanie w wyniku, ale bez VAT i podatku dochodowego.
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
