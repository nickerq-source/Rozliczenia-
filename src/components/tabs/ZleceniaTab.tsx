"use client";

// Zakładka „Zlecenia" (admin): rozliczenie, osobne faktury Damiana i ustawienia miesiąca.

import { useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { LOGISTYK_AUTA } from "@/lib/types";
import type {
  DaneMiesiaca,
  FakturaZlecenLog,
  LogistykUstawienia,
  MiesiącId,
  WorkspaceData,
  ZlecenieLog,
} from "@/lib/types";
import { obliczLogistyka, LOGISTYK_START_MONTH } from "@/lib/logistyk";
import { getLogistykUstawienia } from "@/lib/logistyk-settings";
import { formatZl, formatZlCaly, parseNum } from "@/lib/business-logic";
import { POLSKIE_MIESIACE } from "@/lib/dates";
import { logChange } from "@/lib/audit";
import { NumInput } from "../ui/NumInput";
import { Card, CardTitle } from "../ui/Card";
import { IconPackage, IconUsers, IconX, IconPlus } from "../ui/icons";
import { cn } from "@/lib/utils";
import { LogistykProwizja5Breakdown } from "../LogistykProwizja5Breakdown";
import { LogistykPdfOrderRow } from "../LogistykPdfOrderRow";
import { LogistykInvoicesPanel } from "../LogistykInvoicesPanel";
import { LogistykSettingsPanel } from "../LogistykSettingsPanel";

type SekcjaZlecen = "rozliczenie" | "faktury" | "ustawienia";

function procent(value: number): string {
  return value.toLocaleString("pl-PL", { maximumFractionDigits: 2 });
}

function todayInMonth(miesiac: MiesiącId): string {
  const now = new Date();
  if (now.getFullYear() === 2026 && now.getMonth() + 1 === miesiac) {
    return `2026-${String(miesiac).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  return `2026-${String(miesiac).padStart(2, "0")}-01`;
}

const ddmm = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : iso);

function rejectedSourceKey(order: Pick<ZlecenieLog, "sourceInvoiceId" | "sourceOrderNumber">): string {
  return `${order.sourceInvoiceId ?? ""}|${order.sourceOrderNumber ?? ""}`;
}

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
  const [sekcja, setSekcja] = useState<SekcjaZlecen>("rozliczenie");

  const dane = data.miesiace?.[miesiac];
  const reczne = dane?.zleceniaLog ?? [];
  const fakturyZlecenLog = dane?.fakturyZlecenLog ?? [];
  const ustawieniaLogistyka = useMemo(
    () => getLogistykUstawienia(dane?.logistykUstawienia),
    [dane?.logistykUstawienia]
  );
  const rozliczenie = useMemo(() => obliczLogistyka(data, miesiac), [data, miesiac]);
  const pominieteDuplikatyIds = useMemo(
    () => new Set(rozliczenie.pominieteDuplikatyReczne.map((order) => order.id)),
    [rozliczenie.pominieteDuplikatyReczne]
  );
  const przywroconeOdrzuconeKeys = new Set(
    reczne
      .filter((order) => order.sourceRejectedOverride)
      .map(rejectedSourceKey)
  );

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

  function dodajOdrzucone(order: ZlecenieLog) {
    const sourceKey = rejectedSourceKey(order);
    if (przywroconeOdrzuconeKeys.has(sourceKey)) return;

    const wpis: ZlecenieLog = {
      id: uuidv4(),
      data: order.data,
      plate: order.plate,
      kierowca: order.kierowca,
      wartoscNetto: order.wartoscNetto,
      opis: order.sourceDescription || order.opis,
      dodanyBy: userName,
      createdAt: new Date().toISOString(),
      source: "manual",
      sourceInvoiceId: order.sourceInvoiceId,
      sourceOrderNumber: order.sourceOrderNumber,
      sourceNotes: order.sourceNotes,
      sourceDescription: order.sourceDescription,
      sourceFileName: order.sourceFileName,
      sourceRejectedOverride: true,
    };

    onUpdate((prev) => ({ ...prev, zleceniaLog: [...(prev.zleceniaLog ?? []), wpis] }));
    logChange({
      workspaceId: token,
      userName,
      action: "zlecenie_pdf_przywrocone",
      entity: "zlecenie",
      entityId: wpis.id,
      newValue: {
        plate: wpis.plate,
        kierowca: wpis.kierowca,
        netto: wpis.wartoscNetto,
        sourceOrderNumber: wpis.sourceOrderNumber,
      },
      description: `${userName} dodał odrzucone zlecenie PDF ${wpis.sourceOrderNumber ?? ""}: ${formatZlCaly(wpis.wartoscNetto)} netto`,
      url: `/admin?miesiac=${miesiac}&zakladka=zlecenia`,
    });
  }

  function dodajFaktureDamiana(invoice: FakturaZlecenLog) {
    onUpdate((prev) => ({
      ...prev,
      fakturyZlecenLog: [...(prev.fakturyZlecenLog ?? []), { ...invoice, importedBy: userName }],
    }));
    logChange({
      workspaceId: token,
      userName,
      action: "faktura_zlecen_damiana_dodana",
      entity: "logistics_invoice",
      entityId: invoice.id,
      newValue: {
        numerFaktury: invoice.numerFaktury,
        liczbaZlecen: invoice.pdfImport.sourceRows?.length ?? 0,
        netto: invoice.pdfImport.zleceniaNetto ?? invoice.pdfImport.netto,
      },
      description: `${userName} dodał fakturę zleceń Damiana ${invoice.numerFaktury || invoice.nazwaPliku}`,
      url: `/admin?miesiac=${miesiac}&zakladka=zlecenia`,
    });
  }

  function usunFaktureDamiana(invoice: FakturaZlecenLog) {
    onUpdate((prev) => ({
      ...prev,
      fakturyZlecenLog: (prev.fakturyZlecenLog ?? []).filter((item) => item.id !== invoice.id),
    }));
    logChange({
      workspaceId: token,
      userName,
      action: "faktura_zlecen_damiana_usunieta",
      entity: "logistics_invoice",
      entityId: invoice.id,
      oldValue: {
        numerFaktury: invoice.numerFaktury,
        netto: invoice.pdfImport.zleceniaNetto ?? invoice.pdfImport.netto,
      },
      description: `${userName} usunął fakturę zleceń Damiana ${invoice.numerFaktury || invoice.nazwaPliku}`,
      url: `/admin?miesiac=${miesiac}&zakladka=zlecenia`,
    });
  }

  function zapiszUstawieniaLogistyka(settings: LogistykUstawienia) {
    const normalized = getLogistykUstawienia(settings);
    onUpdate((prev) => ({ ...prev, logistykUstawienia: normalized }));
    logChange({
      workspaceId: token,
      userName,
      action: "ustawienia_logistyka_zmienione",
      entity: "month",
      entityId: String(miesiac),
      oldValue: ustawieniaLogistyka,
      newValue: normalized,
      description: `${userName} zmienił ustawienia rozliczenia logistyka za ${POLSKIE_MIESIACE[miesiac]} 2026`,
      url: `/admin?miesiac=${miesiac}&zakladka=zlecenia`,
    });
  }

  const inputCls = "w-full rounded-lg border border-line bg-input px-3 py-2 text-sm text-ink placeholder:text-dim/40";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1">
        <SekcjaButton active={sekcja === "rozliczenie"} onClick={() => setSekcja("rozliczenie")}>
          Rozliczenie
        </SekcjaButton>
        <SekcjaButton active={sekcja === "faktury"} onClick={() => setSekcja("faktury")}>
          Faktury Damiana
        </SekcjaButton>
        <SekcjaButton active={sekcja === "ustawienia"} onClick={() => setSekcja("ustawienia")}>
          Ustawienia
        </SekcjaButton>
      </div>

      {sekcja === "faktury" ? (
        <LogistykInvoicesPanel
          invoices={fakturyZlecenLog}
          enabled={ustawieniaLogistyka.liczFakturyDamiana}
          onAdd={dodajFaktureDamiana}
          onDelete={usunFaktureDamiana}
        />
      ) : sekcja === "ustawienia" ? (
        <LogistykSettingsPanel
          miesiac={miesiac}
          settings={ustawieniaLogistyka}
          onSave={zapiszUstawieniaLogistyka}
        />
      ) : (
      <>
      {/* Rozliczenie logistyka */}
      <Card>
        <div className="mb-3 flex items-start gap-2">
          <IconUsers size={18} className="mt-0.5 text-amber-brand" />
          <div className="min-w-0 flex-1">
            <CardTitle className="mb-1">Rozliczenie logistyka — {POLSKIE_MIESIACE[miesiac]} 2026</CardTitle>
            <p className="text-[11px] text-dim">
              Składniki wynagrodzenia są liczone według ustawień tego miesiąca. Zlecenia Artura i Żeni
              są pobierane z faktur wspólnych, a Damiana z jego osobnych faktur. Szacunkowo — potwierdza księgowa.
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
          <Wiersz
            label={`${procent(rozliczenie.ustawienia.prowizjaZlecenProcent)}% z netto zleceń (${formatZl(rozliczenie.zleceniaNettoRazem)})${rozliczenie.ustawienia.liczProwizjeZlecen ? "" : " — wyłączone"}`}
            value={rozliczenie.prowizja12}
          />
          <LogistykProwizja5Breakdown rozliczenie={rozliczenie} />
          <Wiersz
            label={`Za auta (${LOGISTYK_AUTA.length} × ${formatZl(rozliczenie.ustawienia.bonusZaAuto)})${rozliczenie.ustawienia.liczBonusZaAuta ? "" : " — wyłączone"}`}
            value={rozliczenie.autaBonus}
          />
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
                <div className="flex justify-between"><span className="text-dim">{procent(rozliczenie.ustawienia.prowizjaZlecenProcent)}% ze zleceń</span><span className="tabular-nums text-ink">{formatZl(a.prowizja12)}</span></div>
                <div className="flex justify-between"><span className="text-dim">Za auto</span><span className="tabular-nums text-green-300">{formatZl(a.bonus)}</span></div>
                {a.prowizja5 > 0 && (
                  <div className="flex justify-between"><span className="text-dim">{procent(rozliczenie.ustawienia.prowizjaNaCzystoProcent)}% z „na czysto”</span><span className="tabular-nums text-ink">{formatZl(a.prowizja5)}</span></div>
                )}
                <div className="flex justify-between border-t border-line/60 pt-1 font-bold"><span className="text-white">Łącznie za auto</span><span className="tabular-nums text-amber-brand">{formatZl(a.lacznie)}</span></div>
                {a.automatyczne && <p className="text-[10px] text-amber-brand">kierowca · zlecenia z faktur</p>}
              </div>
            </div>
          ))}
        </div>
        )}
      </Card>

      {/* Zlecenia automatyczne z pozycji PDF */}
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <IconPackage size={18} className="text-green-400" />
          <CardTitle className="mb-0">
            Automatycznie z faktur ({rozliczenie.zleceniaAutomatyczne.length})
          </CardTitle>
        </div>
        <p className="mb-2 text-[11px] text-dim">
          Zlecenia Artura, Żeni i Damiana są pobierane z pozycji PDF. Rozwiń pozycję, aby zobaczyć pełny opis.
        </p>
        {rozliczenie.zleceniaAutomatyczne.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface2/60 px-3 py-6 text-center text-sm text-dim">
            Brak pozycji z uwagami w zaimportowanych fakturach.
          </p>
        ) : (
          <div>
            {rozliczenie.zleceniaAutomatyczne.map((z) => (
              <LogistykPdfOrderRow key={z.id} order={z} />
            ))}
          </div>
        )}
      </Card>

      {/* Pozycje odrzucone automatycznie, z możliwością ręcznego przywrócenia przez admina */}
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <IconPackage size={18} className="text-amber-brand" />
          <CardTitle className="mb-0">
            Odrzucone z PDF ({rozliczenie.wykluczoneDodatkiAutomatyczne.length})
          </CardTitle>
        </div>
        <p className="mb-2 text-[11px] text-dim">
          System pomija dodatki i pozycje niedzielne. Rozwiń wpis i dodaj go ręcznie tylko wtedy,
          gdy został odrzucony błędnie.
        </p>
        {rozliczenie.wykluczoneDodatkiAutomatyczne.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface2/60 px-3 py-4 text-center text-sm text-dim">
            Brak odrzuconych pozycji w tym miesiącu.
          </p>
        ) : (
          <div>
            {rozliczenie.wykluczoneDodatkiAutomatyczne.map((order) => {
              const przywrocone = przywroconeOdrzuconeKeys.has(rejectedSourceKey(order));
              return (
                <LogistykPdfOrderRow
                  key={order.id}
                  order={order}
                  variant="rejected"
                  action={
                    <button
                      type="button"
                      onClick={() => dodajOdrzucone(order)}
                      disabled={przywrocone}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-brand/50 px-3 py-2 text-xs font-bold text-amber-brand hover:bg-amber-brand/10 disabled:border-green-500/30 disabled:text-green-400 disabled:opacity-80"
                    >
                      <IconPlus size={14} />
                      {przywrocone ? "Dodano do zleceń" : "Dodaj do zleceń"}
                    </button>
                  }
                />
              );
            })}
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
          <CardTitle className="mb-0">Zlecenia ręczne ({reczne.length})</CardTitle>
        </div>
        {rozliczenie.pominieteDuplikatyReczne.length > 0 && (
          <p className="mb-2 rounded-xl border border-amber-brand/35 bg-amber-brand/10 px-3 py-2 text-[11px] text-amber-brand">
            {rozliczenie.pominieteDuplikatyReczne.length} ręcznych wpisów ma już odpowiednik w PDF.
            Pozostają widoczne do usunięcia, ale nie są liczone drugi raz.
          </p>
        )}
        {reczne.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface2/60 px-3 py-6 text-center text-sm text-dim">
            Brak ręcznych zleceń w tym miesiącu.
          </p>
        ) : (
          <div className="divide-y divide-line/50">
            {reczne.map((z) => {
              const pominietyDuplikat = pominieteDuplikatyIds.has(z.id);
              return (
              <div key={z.id} className={`flex items-center gap-3 py-2 ${pominietyDuplikat ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <span className="tabular-nums">{ddmm(z.data)}</span> · {z.kierowca} <span className="text-dim">({z.plate})</span>
                    {z.opis ? <span className="text-dim"> · {z.opis}</span> : null}
                  </p>
                  {z.dodanyBy ? <p className="text-[10px] text-dim/60">wpisał: {z.dodanyBy}</p> : null}
                  {pominietyDuplikat && (
                    <p className="text-[10px] font-semibold text-amber-brand">już pobrane z PDF — pominięte w sumie</p>
                  )}
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
              );
            })}
          </div>
        )}
      </Card>
      </>
      )}
    </div>
  );
}

function SekcjaButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-w-0 rounded-lg px-2 py-2 text-[11px] font-bold leading-tight sm:text-xs",
        active ? "bg-amber-brand text-amber-ink" : "text-dim hover:bg-surface2 hover:text-ink"
      )}
    >
      {children}
    </button>
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
