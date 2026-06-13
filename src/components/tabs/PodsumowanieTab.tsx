"use client";

// Zakładka Podsumowanie — karta P&L z wyróżnionym zyskiem

import { useMemo, ReactNode } from "react";
import {
  DaneMiesiaca,
  DocumentStatus,
  KosztVatInfo,
  MiesiącId,
  Notatka,
  UstawieniaPodatkowe,
  WpisInnegoKosztu,
  WpisTankowania,
} from "@/lib/types";
import { obliczWynikMiesiaca, formatZl, formatZlCaly } from "@/lib/business-logic";
import { POLSKIE_MIESIACE } from "@/lib/dates";
import { Card } from "../ui/Card";
import { NotatkiPanel } from "../panels/NotatkiPanel";
import { PowiadomieniaPanel } from "../panels/PowiadomieniaPanel";
import { PodatkiCard } from "../PodatkiCard";
import { kategoriaLabel, PodatkiMiesiaca, rozbijWpis } from "@/lib/tax";
import { logChange } from "@/lib/audit";
import {
  IconTrendingUp,
  IconUsers,
  IconGasStation,
  IconPackage,
  IconCar,
  IconMoneybag,
  IconCheck,
  IconCalendar,
  IconPaperclip,
} from "../ui/icons";
import { cn } from "@/lib/utils";

function Row({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-line last:border-0">
      <span className="text-dim shrink-0">{icon}</span>
      <span className="text-sm text-ink flex-1">{label}</span>
      <span className={cn("tabular-nums text-sm font-semibold", valueClass ?? "text-ink")}>
        {formatZl(value)}
      </span>
    </div>
  );
}

interface PodsumowanieProps {
  miesiac: MiesiącId;
  dane: DaneMiesiaca;
  token: string;
  userName: string;
  notatki: Notatka[];
  onUpdateNotatki: (updater: (prev: Notatka[]) => Notatka[]) => void;
  onUpdate?: (updater: (prev: DaneMiesiaca) => DaneMiesiaca) => void;
  isAdmin?: boolean;
  // Szacunek podatkowy miesiąca (tylko admin)
  podatki?: PodatkiMiesiaca;
  taxForm?: "skala" | "liniowy";
  ustawienia?: UstawieniaPodatkowe;
}

function statusDokumentu(wpis: KosztVatInfo): DocumentStatus {
  if (wpis.documentStatus) return wpis.documentStatus;
  return (wpis.hasInvoice ?? true) ? "faktura" : "brak";
}

function statusLabel(status: DocumentStatus): string {
  if (status === "brak") return "brak dokumentu";
  return status;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function htmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function PodsumowanieTab({
  miesiac,
  dane,
  token,
  userName,
  notatki,
  onUpdateNotatki,
  onUpdate,
  isAdmin = false,
  podatki,
  taxForm = "skala",
  ustawienia,
}: PodsumowanieProps) {
  const wynik = useMemo(() => obliczWynikMiesiaca(miesiac, dane), [miesiac, dane]);
  const zyskDodatni = wynik.zysk >= 0;

  const wyplata = dane.wyplata ?? { status: "niewypłacone" as const };
  const wyplacone = wyplata.status === "wypłacone";
  const kosztyEksport = useMemo(() => {
    if (!ustawienia) return [];
    const wpisy: {
      id: string;
      typ: "paliwo" | "inny";
      data: string;
      nazwa: string;
      koszt: number;
      wpis: KosztVatInfo & { koszt: number };
    }[] = [
      ...((dane.tankowanie ?? []) as WpisTankowania[]).map((t) => ({
        id: t.id,
        typ: "paliwo" as const,
        data: t.data,
        nazwa: "paliwo",
        koszt: t.koszt,
        wpis: t as KosztVatInfo & { koszt: number },
      })),
      ...((dane.inneKoszty ?? []) as WpisInnegoKosztu[]).map((k) => ({
        id: k.id,
        typ: "inny" as const,
        data: k.data,
        nazwa: k.nazwa || "inny",
        koszt: k.koszt,
        wpis: k as KosztVatInfo & { koszt: number },
      })),
    ];
    return wpisy.map((row) => {
      const r = rozbijWpis(row.wpis, ustawienia, row.typ === "paliwo" ? "paliwo_adblue" : "inne");
      const status = statusDokumentu(row.wpis);
      return {
        data: row.data,
        typ: row.typ,
        nazwa: row.nazwa,
        kategoria: kategoriaLabel(r.kategoria),
        statusDokumentu: statusLabel(status),
        rozliczanyPodatkowo: row.wpis.documentStatus === "brak" ? "nie" : (row.wpis.hasInvoice ?? true) ? "tak" : "nie",
        zalaczniki: row.wpis.zalaczniki?.length ?? 0,
        kwotaBrutto: r.brutto,
        netto: r.netto,
        vat: r.vat,
        vatDoOdliczenia: r.vatDoOdliczenia,
        kosztPodatkowy: r.kosztPit,
      };
    });
  }, [dane.inneKoszty, dane.tankowanie, ustawienia]);

  const kosztyBezDokumentu = useMemo(
    () => kosztyEksport.filter((k) => k.statusDokumentu === "brak dokumentu"),
    [kosztyEksport]
  );

  function exportCsv() {
    const header = [
      "data",
      "typ",
      "nazwa",
      "kategoria",
      "status dokumentu",
      "rozliczany podatkowo",
      "załączniki",
      "brutto",
      "netto",
      "VAT",
      "VAT do odliczenia",
      "koszt podatkowy",
    ];
    const lines = [
      header.map(csvCell).join(";"),
      ...kosztyEksport.map((k) =>
        [
          k.data,
          k.typ,
          k.nazwa,
          k.kategoria,
          k.statusDokumentu,
          k.rozliczanyPodatkowo,
          k.zalaczniki,
          k.kwotaBrutto,
          k.netto,
          k.vat,
          k.vatDoOdliczenia,
          k.kosztPodatkowy,
        ].map(csvCell).join(";")
      ),
      "",
      csvCell("PODSUMOWANIE"),
      `${csvCell("VAT do zapłaty")};${csvCell(podatki?.vatDoZaplaty ?? 0)}`,
      `${csvCell("Podatek dochodowy")};${csvCell(podatki?.pitMiesiac ?? 0)}`,
      `${csvCell("Zdrowotna")};${csvCell(podatki?.zdrowotna ?? 0)}`,
      `${csvCell("Koszty bez dokumentów")};${csvCell(kosztyBezDokumentu.reduce((s, k) => s + k.kwotaBrutto, 0))}`,
    ];
    downloadText(
      `papitrans-${POLSKIE_MIESIACE[miesiac]}-2026-koszty.csv`,
      "\uFEFF" + lines.join("\n"),
      "text/csv;charset=utf-8"
    );
  }

  function exportExcel() {
    const rows = kosztyEksport
      .map(
        (k) =>
          `<tr><td>${htmlEscape(k.data)}</td><td>${htmlEscape(k.typ)}</td><td>${htmlEscape(k.nazwa)}</td><td>${htmlEscape(k.kategoria)}</td><td>${htmlEscape(k.statusDokumentu)}</td><td>${htmlEscape(k.rozliczanyPodatkowo)}</td><td>${k.zalaczniki}</td><td>${k.kwotaBrutto}</td><td>${k.netto}</td><td>${k.vat}</td><td>${k.vatDoOdliczenia}</td><td>${k.kosztPodatkowy}</td></tr>`
      )
      .join("");
    const html = `
      <html><head><meta charset="utf-8" /></head><body>
      <table>
        <tr><th colspan="12">PapiTrans — ${POLSKIE_MIESIACE[miesiac]} 2026 — koszty</th></tr>
        <tr><th>Data</th><th>Typ</th><th>Nazwa</th><th>Kategoria</th><th>Status dokumentu</th><th>Rozliczany podatkowo</th><th>Załączniki</th><th>Brutto</th><th>Netto</th><th>VAT</th><th>VAT do odliczenia</th><th>Koszt podatkowy</th></tr>
        ${rows}
      </table>
      <br />
      <table>
        <tr><th>Pozycja</th><th>Kwota</th></tr>
        <tr><td>VAT do zapłaty</td><td>${podatki?.vatDoZaplaty ?? 0}</td></tr>
        <tr><td>Podatek dochodowy</td><td>${podatki?.pitMiesiac ?? 0}</td></tr>
        <tr><td>Zdrowotna</td><td>${podatki?.zdrowotna ?? 0}</td></tr>
        <tr><td>Koszty bez dokumentów</td><td>${kosztyBezDokumentu.reduce((s, k) => s + k.kwotaBrutto, 0)}</td></tr>
      </table>
      </body></html>
    `;
    downloadText(
      `papitrans-${POLSKIE_MIESIACE[miesiac]}-2026.xls`,
      html,
      "application/vnd.ms-excel;charset=utf-8"
    );
  }

  function exportPdf() {
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) return;
    const rows = kosztyEksport
      .map(
        (k) => `<tr><td>${htmlEscape(k.data)}</td><td>${htmlEscape(k.nazwa)}</td><td>${htmlEscape(k.kategoria)}</td><td>${htmlEscape(k.statusDokumentu)}</td><td>${formatZl(k.kwotaBrutto)}</td><td>${formatZl(k.vatDoOdliczenia)}</td><td>${formatZl(k.kosztPodatkowy)}</td></tr>`
      )
      .join("");
    win.document.write(`
      <!doctype html><html><head><meta charset="utf-8" />
      <title>PapiTrans ${POLSKIE_MIESIACE[miesiac]} 2026</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#111}
        h1{font-size:22px;margin:0 0 16px}
        h2{font-size:15px;margin:18px 0 8px}
        table{border-collapse:collapse;width:100%;font-size:12px}
        td,th{border:1px solid #ddd;padding:6px;text-align:left}
        th{background:#f3f3f3}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:620px}
        .box{border:1px solid #ddd;padding:10px;border-radius:8px}
      </style></head><body>
      <h1>PapiTrans — ${POLSKIE_MIESIACE[miesiac]} 2026</h1>
      <div class="grid">
        <div class="box">Przychód: <b>${formatZl(wynik.przychod)}</b></div>
        <div class="box">Koszty operacyjne: <b>${formatZl(wynik.wynagrodzeniePracownika + wynik.paliwo + wynik.inne + wynik.leasing)}</b></div>
        <div class="box">VAT do zapłaty: <b>${formatZl(podatki?.vatDoZaplaty ?? 0)}</b></div>
        <div class="box">Podatek dochodowy: <b>${formatZl(podatki?.pitMiesiac ?? 0)}</b></div>
        <div class="box">Zdrowotna: <b>${formatZl(podatki?.zdrowotna ?? 0)}</b></div>
        <div class="box">Koszty bez dokumentów: <b>${formatZl(kosztyBezDokumentu.reduce((s, k) => s + k.kwotaBrutto, 0))}</b></div>
      </div>
      <h2>Koszty</h2>
      <table><thead><tr><th>Data</th><th>Nazwa</th><th>Kategoria</th><th>Dokument</th><th>Brutto</th><th>VAT odlicz.</th><th>Koszt podatkowy</th></tr></thead><tbody>${rows}</tbody></table>
      <script>window.print()</script>
      </body></html>
    `);
    win.document.close();
  }

  function oznaczWyplate() {
    if (!onUpdate) return;
    const nazwa = POLSKIE_MIESIACE[miesiac];
    if (wyplacone) {
      if (!window.confirm(`Cofnąć oznaczenie wypłaty za ${nazwa} 2026?`)) return;
      onUpdate((prev) => ({ ...prev, wyplata: { status: "niewypłacone" } }));
      logChange({
        workspaceId: token,
        userName,
        action: "wyplata_cofnieta",
        entity: "payroll",
        entityId: String(miesiac),
        description: `${userName} cofnął oznaczenie wypłaty kierowcy ${nazwa} 2026`,
        url: `/admin?miesiac=${miesiac}&zakladka=podsumowanie`,
      });
      return;
    }
    if (
      !window.confirm(
        `Na pewno oznaczyć wypłatę za ${nazwa} 2026 (${formatZlCaly(wynik.wynagrodzeniePracownika)}) jako wypłaconą?`
      )
    ) return;

    onUpdate((prev) => ({
      ...prev,
      wyplata: {
        status: "wypłacone",
        paidAt: new Date().toISOString(),
        paidBy: userName,
      },
    }));
    logChange({
      workspaceId: token,
      userName,
      action: "wyplata_oznaczona",
      entity: "payroll",
      entityId: String(miesiac),
      description: `${userName} oznaczył wypłatę kierowcy ${nazwa} 2026 (${formatZlCaly(wynik.wynagrodzeniePracownika)}) jako wypłaconą`,
      url: `/admin?miesiac=${miesiac}&zakladka=podsumowanie`,
    });
  }

  return (
    <div className="space-y-4">
      {/* Karta P&L */}
      <Card>
        <h2 className="text-lg font-bold text-white mb-4">
          {POLSKIE_MIESIACE[miesiac]} 2026 — Rachunek zysków i strat
        </h2>

        {/* PRZYCHÓD */}
        <div className="mb-3">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-brand mb-1">Przychód</p>
          <Row
            icon={<IconTrendingUp size={18} />}
            label="Faktury za miesiąc"
            value={wynik.przychod}
            valueClass="text-green-400"
          />
        </div>

        {/* KOSZTY */}
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-dim mb-1">Koszty</p>
          <Row icon={<IconUsers size={18} />} label="Wynagrodzenie kierowcy" value={wynik.wynagrodzeniePracownika} />
          <Row icon={<IconGasStation size={18} />} label="Paliwo" value={wynik.paliwo} />
          <Row icon={<IconPackage size={18} />} label="Inne koszty" value={wynik.inne} />
          <Row icon={<IconCar size={18} />} label="Leasing" value={wynik.leasing} />
        </div>

        {/* ZYSK NA CZYSTO */}
        <div
          className="flex items-center gap-3 rounded-2xl px-4 py-4"
          style={{ background: zyskDodatni ? "var(--green-bg)" : "var(--red-bg)" }}
        >
          <span className={zyskDodatni ? "text-green-400" : "text-red-400"}>
            <IconMoneybag size={26} />
          </span>
          <span className="text-sm font-bold text-white uppercase tracking-wide flex-1">
            Zysk przed podatkami
          </span>
          <span
            className={cn(
              "tabular-nums text-[28px] font-extrabold leading-none",
              zyskDodatni ? "text-green-300" : "text-red-300"
            )}
          >
            {formatZl(wynik.zysk)}
          </span>
        </div>
      </Card>

      {/* Kasa na koniec miesiąca */}
      {isAdmin && podatki && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <IconMoneybag size={18} className="text-amber-brand" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-dim">
              Kasa na koniec miesiąca
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-surface2 border border-line p-3">
              <p className="text-[11px] text-dim">Realnie zostaje</p>
              <p className={cn("tabular-nums text-lg font-extrabold", podatki.cashflowPoPodatkach >= 0 ? "text-green-300" : "text-red-300")}>
                {formatZl(podatki.cashflowPoPodatkach)}
              </p>
            </div>
            <div className="rounded-xl bg-surface2 border border-line p-3">
              <p className="text-[11px] text-dim">Bezpiecznie do wypłaty</p>
              <p className={cn("tabular-nums text-lg font-extrabold", podatki.cashflowPoPodatkach > 0 ? "text-green-300" : "text-dim")}>
                {formatZl(Math.max(0, podatki.cashflowPoPodatkach))}
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-dim">Odłożyć na VAT</span>
              <span className="tabular-nums text-red-300">{formatZl(Math.max(0, podatki.vatDoZaplaty))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dim">Odłożyć na podatek dochodowy</span>
              <span className="tabular-nums text-red-300">{formatZl(podatki.pitMiesiac)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-dim">Odłożyć na zdrowotną</span>
              <span className="tabular-nums text-red-300">{formatZl(podatki.zdrowotna)}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Eksport dla księgowej */}
      {isAdmin && ustawienia && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <IconPaperclip size={18} className="text-amber-brand" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-dim flex-1">
              Eksport dla księgowej
            </h3>
            {kosztyBezDokumentu.length > 0 && (
              <span className="rounded-full bg-red-soft border border-red-500/35 px-2 py-1 text-[10px] font-bold text-red-200">
                {kosztyBezDokumentu.length} bez dok.
              </span>
            )}
          </div>
          <p className="text-xs text-dim mb-3">
            Eksport zawiera koszty, VAT, podatek dochodowy, zdrowotną i koszty bez dokumentów.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-xl border border-amber-brand/50 px-3 py-2 text-xs font-bold text-amber-brand hover:bg-amber-brand/10"
            >
              CSV
            </button>
            <button
              type="button"
              onClick={exportExcel}
              className="rounded-xl bg-amber-brand px-3 py-2 text-xs font-extrabold text-amber-ink hover:bg-[#e09420]"
            >
              Excel
            </button>
            <button
              type="button"
              onClick={exportPdf}
              className="rounded-xl border border-line px-3 py-2 text-xs font-bold text-dim hover:text-ink hover:bg-surface2"
            >
              PDF
            </button>
          </div>
        </Card>
      )}

      {/* Wypłata kierowcy (tylko admin) */}
      {isAdmin && (
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <IconUsers size={18} className="text-amber-brand" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-dim">
              {POLSKIE_MIESIACE[miesiac]} 2026 — Wypłata kierowcy
            </h3>
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xl font-extrabold text-white tabular-nums">
                {formatZlCaly(wynik.wynagrodzeniePracownika)}
              </p>
              <p className={cn("text-xs mt-0.5 flex items-center gap-1.5", wyplacone ? "text-green-300" : "text-dim")}>
                <span className={cn("w-1.5 h-1.5 rounded-full", wyplacone ? "bg-green-400" : "bg-amber-brand")} />
                {wyplacone
                  ? `Wypłacone${wyplata.paidAt ? ` — ${new Date(wyplata.paidAt).toLocaleDateString("pl-PL")}` : ""}${wyplata.paidBy ? ` (${wyplata.paidBy})` : ""}`
                  : "Niewypłacone"}
              </p>
            </div>
            <button
              onClick={oznaczWyplate}
              className={cn(
                "px-4 py-2 min-h-[40px] rounded-xl text-sm font-bold transition-all duration-150",
                wyplacone
                  ? "border border-line text-dim hover:text-ink"
                  : "bg-amber-brand text-amber-ink hover:bg-[#e09420]"
              )}
            >
              {wyplacone ? "Cofnij oznaczenie" : "Oznacz jako wypłacone"}
            </button>
          </div>
        </Card>
      )}

      {/* Podatki — szacunek (tylko admin) */}
      {isAdmin && podatki && <PodatkiCard p={podatki} taxForm={taxForm} wynik={wynik} />}

      {/* Notatki + Powiadomienia: 2 kolumny na desktop, stack na mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <NotatkiPanel
          token={token}
          miesiac={miesiac}
          notatki={notatki}
          userName={userName}
          onUpdate={onUpdateNotatki}
        />
        <PowiadomieniaPanel token={token} userName={userName} />
      </div>

      {/* Statystyki — pille */}
      <Card>
        <div className="flex flex-wrap gap-2">
          <span className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-surface2 border border-line text-sm">
            <IconCalendar size={16} className="text-dim" />
            <span className="text-dim">Soboty:</span>
            <span className="font-bold text-white tabular-nums">
              {wynik.liczbaSobotPrzepracowanych} / 4
            </span>
          </span>

          <span
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-full border text-sm",
              wynik.premiaUwzglednioneod4Soboty
                ? "bg-green-soft border-green-500/40"
                : "bg-surface2 border-line"
            )}
          >
            <IconCheck
              size={16}
              className={wynik.premiaUwzglednioneod4Soboty ? "text-green-400" : "text-dim"}
            />
            <span className="text-dim">Premia:</span>
            <span
              className={cn(
                "font-bold tabular-nums",
                wynik.premiaUwzglednioneod4Soboty ? "text-green-300" : "text-dim"
              )}
            >
              {wynik.premiaUwzglednioneod4Soboty ? "+ 200 zł" : "brak"}
            </span>
          </span>
        </div>

        {/* Szczegóły wynagrodzenia */}
        <div className="mt-4 pt-3 border-t border-line">
          <p className="text-xs text-dim uppercase tracking-wider font-bold mb-2">
            Szczegóły wynagrodzenia
          </p>
          <div className="flex justify-between text-sm py-1">
            <span className="text-dim">Suma dniówek</span>
            <span className="tabular-nums text-ink">{formatZlCaly(wynik.sumaDniowek)}</span>
          </div>
          <div className="flex justify-between text-sm py-1">
            <span className="text-dim">Premia (≥4 soboty)</span>
            <span className={cn("tabular-nums", wynik.premia > 0 ? "text-amber-brand" : "text-dim")}>
              {wynik.premia > 0 ? `+ ${formatZlCaly(wynik.premia)}` : "0 zł"}
            </span>
          </div>
          <div className="flex justify-between text-sm pt-2 border-t border-line font-bold">
            <span className="text-white">Łącznie wynagrodzenie</span>
            <span className="tabular-nums text-white">{formatZlCaly(wynik.wynagrodzeniePracownika)}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
