"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DaneMiesiaca, MiesiącId, PDFImportDiagnosticRow, WorkspaceData } from "@/lib/types";
import { PREVIEW_DRIVERS, preparePreviewSnapshot, previewMonth, previewSearch, readPreviewLocation, type PreviewDay, type PreviewLocation, type PreviewSection } from "@/lib/admin-preview";
import { formatZl, czyTankowanieWliczane } from "@/lib/business-logic";
import { MIESIACE_ZAKRESU, POLSKIE_MIESIACE, getDefaultMonth } from "@/lib/dates";
import { calculateInvoiceAmounts } from "@/lib/invoice-amounts";
import { kategoriaLabel, podatkiRoku, rozbijWpis } from "@/lib/tax";
import { obliczLogistyka, LOGISTYK_START_MONTH } from "@/lib/logistyk";
import { podsumujSaldo, tekstSalda, zbierzPozycjeMiesiaca } from "@/lib/rozliczenie-5050";
import { IconTruck, IconChevronDown, IconLock, IconUsers, IconChartBar, IconMoneybag, IconNotes } from "../ui/icons";
import { PreviewDriver } from "./PreviewDriver";
import "./admin-preview.css";

const companySections: [PreviewSection, string, string][] = [
  ["start", "Podsumowanie firmy", "Przychód, wszystkie koszty i to, co zostaje"],
  ["faktury", "Faktury firmy", "Wspólne dokumenty, import PDF i przelewy na Alior"],
  ["koszty", "Koszty firmy", "Zakupy, leasing, paliwo i zatwierdzanie zgłoszeń"],
];
const extraSections: [PreviewSection, string, string][] = [
  ["zlecenia", "Zlecenia i logistyk", "Pozycje z PDF, ręczne wpisy i prowizje"],
  ["podatki", "Podatki firmy", "VAT, podatek dochodowy i składki"],
  ["wspolnicy", "Rozliczenie 50/50", "Wydatki Artura, Damiana i firmy"],
  ["raporty", "Raporty", "Porównanie miesięcy"],
  ["wiadomosci", "Wiadomości", "Notatki i wątki kierowcy"],
  ["ustawienia", "Ustawienia", "Obecne parametry rozliczeń"],
];
const companyMenu = [...companySections, ...extraSections];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="pv-row"><span>{label}</span><strong>{children}</strong></div>;
}

function PdfRows({ title, rows }: { title: string; rows: PDFImportDiagnosticRow[] }) {
  return <details className="pv-group"><summary>{title} ({rows.length})</summary>
    {!rows.length && <p className="pv-empty">Brak pozycji.</p>}
    {rows.map((row, i) => <details key={`${row.orderNumber}-${i}`}>
      <summary><span>{row.date ?? "Brak daty"} · {row.driverName || "Nieustalony kierowca"}<small>{row.orderNumber}</small></span><strong>{formatZl(row.cost)} netto</strong></summary>
      <p>{row.additionalDescription || row.notes || row.route || "Brak opisu"}</p>
      <p className="pv-muted">{row.reason}</p>
    </details>)}
  </details>;
}

export interface LiveFleetControls {
  busy: boolean;
  toolbar: ReactNode;
  onSaveDay: (month: MiesiącId, day: PreviewDay) => Promise<boolean>;
  payroll: (month: MiesiącId, dane: DaneMiesiaca) => ReactNode;
  invoices: (month: MiesiącId, dane: DaneMiesiaca) => ReactNode;
}
export function AdminPreview({ source, updatedAt, live }: { source: WorkspaceData; updatedAt: string | null; live?: LiveFleetControls }) {
  const snapshot = useMemo(() => preparePreviewSnapshot(source), [source]);
  const [location, setLocation] = useState<PreviewLocation>(() => readPreviewLocation("", getDefaultMonth()));
  const [drafts, setDrafts] = useState<Partial<Record<MiesiącId, PreviewDay[]>>>({});
  const scrollPositions = useRef(new Map<string, number>());
  const current = useRef(location);
  current.current = location;

  useEffect(() => {
    const restore = () => {
      const next = readPreviewLocation(window.location.search, getDefaultMonth());
      setLocation(next);
      requestAnimationFrame(() => window.scrollTo(0, scrollPositions.current.get(previewSearch(next)) ?? 0));
    };
    restore();
    window.addEventListener("popstate", restore);
    const remember = () => scrollPositions.current.set(previewSearch(current.current), window.scrollY);
    window.addEventListener("scroll", remember, { passive: true });
    return () => { window.removeEventListener("popstate", restore); window.removeEventListener("scroll", remember); };
  }, []);

  const hasDrafts = Object.values(drafts).some(days => days && days.length > 0);
  useEffect(() => {
    if (!hasDrafts) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasDrafts]);

  function navigate(patch: Partial<PreviewLocation>) {
    const next = { ...location, ...patch };
    window.history.pushState(null, "", previewSearch(next));
    setLocation(next);
    requestAnimationFrame(() => window.scrollTo(0, scrollPositions.current.get(previewSearch(next)) ?? 0));
  }
  const { month, section } = location;
  const { dane, result, settings, tax } = useMemo(() => previewMonth(snapshot, month), [snapshot, month]);
  const available = source.miesiace?.[month] != null;
  const invoices = dane.faktury.filter(f => f.pdfImport || f.kwota > 0 || (f.premiowanaKwotaNetto ?? 0) > 0 || f.opisPremiowanej);
  const activeInvoice = invoices.find(f => f.id === location.invoice);
  const legacyUrl = (tab: string) => `/admin?miesiac=${month}&zakladka=${tab}`;
  const go = (target: PreviewSection, title: string, subtitle?: string, patch?: Partial<PreviewLocation>) =>
    <button className="pv-list-row" onClick={() => navigate({ section: target, invoice: null, ...patch })}>
      <span>{title}{subtitle && <small>{subtitle}</small>}</span><IconChevronDown className="pv-chevron" size={18} aria-hidden />
    </button>;
  const back = (title: string, patch: Partial<PreviewLocation>) => <button className="pv-back" onClick={() => navigate(patch)}><IconChevronDown className="pv-back-icon" size={16} aria-hidden />{title}</button>;
  const oldPanel = (tab: string, title: string) => <a className="pv-old-link" href={legacyUrl(tab)}>{title} w obecnym panelu</a>;
  const cashTaxes = Math.max(0, tax.vatDoZaplaty) + tax.pitMiesiac + tax.zdrowotna;
  const pendingFuel = dane.tankowanie.filter(t => t.status === "pending").length;
  const untransferred = invoices.filter(f => !f.transferredToAlior).length;
  const logistics = useMemo(() => obliczLogistyka(snapshot, month), [snapshot, month]);
  const groupedCosts = [
    ...dane.tankowanie.map(t => ({ id: `fuel-${t.id}`, date: t.expenseDate || t.data, label: t.stationName || "Tankowanie", category: "paliwo" as const,
      included: czyTankowanieWliczane(t), status: t.status === "pending" ? "Oczekuje na zatwierdzenie" : t.status === "rejected" ? "Odrzucone" : "", source: t,
      vehicle: snapshot.vehicles?.find(v => v.id === t.vehicleId)?.registration ?? t.vehicleId ?? null })),
    ...dane.inneKoszty.map(k => ({ id: `cost-${k.id}`, date: k.data, label: k.nazwa || kategoriaLabel(k.kategoria), category: "pozostale" as const, included: true, status: "", source: k, vehicle: null })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const hasLegacyLease = result.leasing > 0 && !dane.inneKoszty.some(k => k.kategoria === "leasing" && k.koszt > 0);

  return <div className="admin-preview">
    <div className="pv-mode"><span><IconLock size={14} aria-hidden />{live ? "Panel administratora · zapis do bazy" : "Podgląd · tylko odczyt"}</span><a href={legacyUrl("podsumowanie")}>Wróć do obecnego panelu</a></div>
    <header className="pv-header">
      <div className="pv-brand"><IconTruck size={22} aria-hidden /><strong>PapiTrans</strong><span>Panel administratora</span></div>
      <nav className="pv-root-nav" aria-label="Główne działy">
        <button aria-current={section !== "kierowcy" ? "page" : undefined} onClick={() => navigate({ section: "menu", driver: null, invoice: null })}><IconChartBar size={18} aria-hidden />Menu główne</button>
        <button aria-current={section === "kierowcy" ? "page" : undefined} onClick={() => navigate({ section: "kierowcy", driver: null, invoice: null })}><IconUsers size={18} aria-hidden />Kierowcy</button>
      </nav>
      <div className="pv-context"><span>{section === "kierowcy" ? "Rozliczenie kierowcy" : "Rozliczenie firmy"}</span><label className="pv-month">Miesiąc<select aria-label="Miesiąc" value={month} onChange={e => navigate({ month: Number(e.target.value) as MiesiącId, invoice: null })}>{MIESIACE_ZAKRESU.map(m => <option key={m} value={m}>{POLSKIE_MIESIACE[m]} 2026</option>)}</select></label></div>
    </header>
    <main>
      {live?.toolbar}
      {dane.rafal && result.rafal.incomplete && <p className="pv-notice" role="status">Rafał: brakuje kwot w dniach lub uzgodnionych danych rozliczenia. Wynik firmy jest niepełny.</p>}
      {section !== "menu" && section !== "kierowcy" && back("Menu główne", { section: "menu", invoice: null })}
      {!available && section !== "kierowcy" && section !== "menu" && <p className="pv-notice">Brak zapisanych danych dla wybranego miesiąca.</p>}
      {section === "menu" && <>
        <h1>Menu główne</h1>
        <div className="pv-menu-summary"><span>Cała firma · {POLSKIE_MIESIACE[month]}</span><strong>{available ? formatZl(tax.cashflowPoPodatkach) : "Brak danych"}</strong><small>Po wszystkich kosztach i podatkach</small></div>
        <div className="pv-menu-groups">
          <section><h2><IconMoneybag size={18} aria-hidden />Finanse firmy</h2>{companySections.map(([id, title, sub]) => <div key={id}>{go(id, title, sub)}</div>)}{go("podatki", "Podatki firmy", "VAT, podatek dochodowy i składki")}</section>
          <section><h2><IconNotes size={18} aria-hidden />Rozliczenia i organizacja</h2>{extraSections.filter(([id]) => id !== "podatki").map(([id, title, sub]) => <div key={id}>{go(id, title, sub)}</div>)}</section>
        </div>
      </>}
      {section === "start" && <>
        <h1>Wynik miesiąca</h1>
        <Row label="Przychód brutto">{available ? formatZl(result.przychod) : "Brak danych"}</Row>
        <Row label="Wszystkie koszty operacyjne">{available ? formatZl(result.kosztyOperacyjne) : "Brak danych"}</Row>
        <Row label="Podatki i składki właściciela">{available ? formatZl(cashTaxes) : "Brak danych"}</Row>
        <div className="pv-result"><span>Zostaje po wszystkich kosztach i podatkach</span><strong data-testid="company-result">{available ? formatZl(tax.cashflowPoPodatkach) : "Brak danych"}</strong></div>
        {available && <details><summary>Co składa się na koszty?</summary>
          <Row label="Cała wypłata Żeni po potrąceniach">{formatZl(result.wynagrodzenieDoWyplaty)}</Row>
          <Row label="Zobowiązania za pracownika">{formatZl(result.obciazeniaPracownika)}</Row>
          {result.rafal.active && <><Row label="Rafał · wynagrodzenie netto">{formatZl(result.rafal.payout)}</Row><Row label="Rafał · zobowiązania z umowy">{formatZl(result.rafal.charges)}</Row></>}
          {result.rafal.estimated && <p className="pv-muted">Umowa Rafała: szacunek od najniższej krajowej, pełny etat i miesiąc.</p>}
          <Row label="Paliwo">{formatZl(result.paliwo)}</Row><Row label="Leasing">{formatZl(result.leasing)}</Row><Row label="Inne koszty">{formatZl(result.inne)}</Row>
        </details>}
        <h2>Do załatwienia</h2>
        {untransferred > 0 && go("faktury", `Przelew na Alior: ${untransferred} faktur bez oznaczenia`)}
        {pendingFuel > 0 && go("koszty", `Tankowania do zatwierdzenia: ${pendingFuel}`, undefined, { filter: "paliwo" })}
        {result.wynagrodzenieDoWyplaty > 0 && dane.wyplata?.status !== "wypłacone" && go("kierowcy", "Żenia: wypłata nieoznaczona", formatZl(result.wynagrodzenieDoWyplaty), { driver: "zenia", part: "dni" })}
        {available && cashTaxes > 0 && !snapshot.podatkiOplacone?.[month]?.oplacono && go("podatki", "Podatki nieoznaczone jako opłacone", formatZl(cashTaxes))}
      </>}
      {section === "faktury" && <>
        {live?.invoices(month, dane)}
        {location.invoice ? <>{back("Lista faktur", { invoice: null })}
          {activeInvoice ? <><h1>{activeInvoice.rodzaj === "premiowana" ? "Faktura premiowana" : activeInvoice.label}</h1>
            <p className="pv-muted">{activeInvoice.pdfImport?.numerFaktury ?? "Wpis ręczny"} · {activeInvoice.pdfImport?.nazwaPliku}</p>
            {Object.entries(calculateInvoiceAmounts(activeInvoice, settings)).map(([key, value]) => <Row key={key} label={key === "vat" ? "VAT" : key === "netto" ? "Netto" : "Brutto"}>{formatZl(value)}</Row>)}
            <Row label="Przelane na konto Alior Bank">{activeInvoice.transferredToAlior ? "Tak" : "Nie oznaczono"}</Row>
            <Row label="Status faktury">{activeInvoice.status?.replaceAll("_", " ") ?? "do wystawienia"}</Row>
            <p>{activeInvoice.opisPremiowanej || activeInvoice.pdfImport?.komentarz}</p>
            {activeInvoice.pdfImport && <>
              <p className="pv-notice">Zapisany import: {activeInvoice.pdfImport.filters?.driverName || "kierowca nieoznaczony"}. Podgląd nie przelicza ani nie przypisuje ponownie pozycji.</p>
              <PdfRows title="Uwzględnione" rows={activeInvoice.pdfImport.pozycjeUwzglednione ?? []} />
              <PdfRows title="Odrzucone" rows={activeInvoice.pdfImport.pozycjeOdrzucone ?? []} />
              <PdfRows title="Do sprawdzenia" rows={activeInvoice.pdfImport.reviewRows ?? []} />
            </>}
          </> : <p role="alert">Nie znaleziono faktury w wybranym miesiącu.</p>}
        </> : <><h1>Faktury</h1>
          {!invoices.length && <p className="pv-empty">Brak zapisanych faktur.</p>}
          {invoices.map(f => <button className="pv-list-row" key={f.id} onClick={() => navigate({ invoice: f.id })}><span>{f.rodzaj === "premiowana" ? "Faktura premiowana" : f.label}<small>{f.pdfImport?.zakresOd && f.pdfImport?.zakresDo ? `${f.pdfImport.zakresOd} – ${f.pdfImport.zakresDo}` : f.customRange ? `${f.customRange.od} – ${f.customRange.do}` : "Brak zakresu dat"}</small><small>{f.transferredToAlior ? "Alior: oznaczono przelew" : "Alior: nie oznaczono"}</small></span><strong>{formatZl(calculateInvoiceAmounts(f, settings).brutto)}<small>brutto</small></strong></button>)}
        </>}
        {oldPanel("zarobek", "Import i edycja faktur")}
      </>}
      {section === "kierowcy" && (location.driver ? <>
        {back("Lista kierowców", { driver: null })}
        <PreviewDriver key={`${location.driver}-${month}`} driver={location.driver} part={location.part} onPart={part => navigate({ part })} month={month} dane={dane} available={available} settings={settings} drafts={live ? dane.rafal?.days ?? [] : drafts[month] ?? []} onDrafts={days => setDrafts(prev => ({ ...prev, [month]: days }))} onCompany={target => navigate({ section: target, driver: null, invoice: null })} live={live ? { busy: live.busy, saveDay: day => live.onSaveDay(month, day), payroll: live.payroll(month, dane) } : undefined} />
      </> : <><h1>Kierowcy</h1><div className="pv-driver-list">
        {(["zenia", "rafal"] as const).map(id => <button className="pv-driver-choice" key={id} onClick={() => navigate({ driver: id, part: "podsumowanie" })}>
          <span className="pv-initials" aria-hidden>{id === "zenia" ? "YP" : "RG"}</span><span><strong>{PREVIEW_DRIVERS[id]}</strong><small>{id === "zenia" ? "Żenia · obecne rozliczenie" : live ? "Dni i kursy · umowa o pracę" : "Umowa o pracę · profil testowy"}</small></span><IconChevronDown className="pv-chevron" size={18} aria-hidden />
        </button>)}
      </div></>)}
      {section === "koszty" && <>
        <h1>Koszty zakupowe</h1><div className="pv-tabs" aria-label="Rodzaj kosztów">{([ ["wszystkie", "Wszystkie"], ["paliwo", "Paliwo"], ["pozostale", "Pozostałe"] ] as const).map(([id, title]) => <button key={id} aria-pressed={location.filter === id} onClick={() => navigate({ filter: id })}>{title}</button>)}</div>
        <Row label="Zakupy w wyniku miesiąca · brutto">{available ? formatZl(result.paliwo + result.inne + result.leasing) : "Brak danych"}</Row>
        {groupedCosts.filter(row => location.filter === "wszystkie" || row.category === location.filter).map(row => {
          const cost = rozbijWpis(row.source, settings, row.category === "paliwo" ? "paliwo_adblue" : "inne");
          return <details key={row.id}><summary><span>{row.label}<small>{row.date} · {row.status || (row.included ? "Wliczony" : "Poza wynikiem")}</small></span><strong>{formatZl(cost.brutto)}<small>brutto</small></strong></summary>
            <Row label="Zapłacił">{row.source.paidBy ?? "Firma"}</Row><Row label="Samochód">{row.vehicle ?? "Nieprzypisany"}</Row>
            <Row label="Kategoria">{kategoriaLabel(cost.kategoria)}</Row>{row.included && <><Row label="Netto">{formatZl(cost.netto)}</Row><Row label="VAT do odliczenia">{formatZl(cost.vatDoOdliczenia)}</Row></>}
            <p>{row.source.opis}</p>
          </details>;
        })}
        {hasLegacyLease && location.filter !== "paliwo" && <Row label="Leasing · zapis historyczny">{formatZl(result.leasing)}</Row>}
        {!groupedCosts.length && !hasLegacyLease && <p className="pv-empty">Brak zapisanych zakupów.</p>}
        {oldPanel("koszty", "Dodawanie i zatwierdzanie kosztów")}
      </>}
      {extraSections.some(([id]) => id === section) && <h1>{companyMenu.find(([id]) => id === section)?.[1]}</h1>}
      {section === "podatki" && <>
        <Row label="VAT do zapłaty">{available ? formatZl(Math.max(0, tax.vatDoZaplaty)) : "Brak danych"}</Row><Row label="Podatek dochodowy">{available ? formatZl(tax.pitMiesiac) : "Brak danych"}</Row><Row label="Zdrowotna właściciela">{available ? formatZl(tax.zdrowotna) : "Brak danych"}</Row>
        {available && <><details><summary>Podstawa obliczeń</summary><Row label="Przychód netto">{formatZl(tax.przychodNetto)}</Row><Row label="Koszty podatkowe">{formatZl(tax.kosztyPodatkowe)}</Row><Row label="Dochód podatkowy">{formatZl(tax.dochod)}</Row><Row label="Dochód narastająco">{formatZl(tax.dochodYtd)}</Row><Row label="Nadwyżka VAT do przeniesienia">{formatZl(tax.vatNadwyzkaDoPrzeniesienia)}</Row></details>
        <details><summary>Zobowiązania za pracownika · ujęte już w kosztach</summary><Row label="Podatek pracownika">{formatZl(result.podatekDochodowyPracownika)}</Row><Row label="Zdrowotna pracownika">{formatZl(result.skladkaZdrowotnaPracownika)}</Row><Row label="Pozostałe składki">{formatZl(result.pozostaleSkladkiZusPracownika)}</Row></details></>}
        {oldPanel("podatki", "Oznaczenie zapłaty podatków")}
      </>}
      {section === "zlecenia" && <>
        {!available ? <p className="pv-empty">Brak danych rozliczenia.</p> : month < LOGISTYK_START_MONTH ? <p>Rozliczenie logistyka obowiązuje od sierpnia 2026.</p> : <>
          <Row label="Zlecenia netto">{formatZl(logistics.zleceniaNettoRazem)}</Row><Row label="Wynagrodzenie logistyka">{formatZl(logistics.razem)}</Row>
          <details><summary>Składniki rozliczenia</summary><Row label="Prowizja od zleceń">{formatZl(logistics.prowizja12)}</Row><Row label="Bonus za auta">{formatZl(logistics.autaBonus)}</Row>{logistics.ustawienia.liczProwizjeNaCzysto && <Row label="Prowizja od wyniku">{formatZl(logistics.prowizja5)}</Row>}</details>
          {([ ["Zlecenia z faktur", logistics.zleceniaAutomatyczne], ["Dopisane ręcznie", logistics.zleceniaReczneDoRozliczenia], ["Odrzucone", logistics.wykluczoneDodatkiAutomatyczne] ] as const).map(([title, orders]) => <details key={title}><summary>{title} ({orders.length})</summary>{orders.map((order, i) => <details key={`${order.id}-${i}`}><summary><span>{order.data} · {order.kierowca}</span><strong>{formatZl(order.wartoscNetto)}</strong></summary><p>{order.opis || order.sourceDescription || order.sourceNotes || "Brak opisu"}</p><p>{order.sourceExclusionReason}</p></details>)}</details>)}
        </>}{oldPanel("zlecenia", "Edycja zleceń i ustawień logistyka")}
      </>}
      {section === "wspolnicy" && available && (() => { const saldo = podsumujSaldo(zbierzPozycjeMiesiaca(dane, settings, month)); return <><Row label="Zapłacił Artur">{formatZl(saldo.arturPaid)}</Row><Row label="Zapłacił Damian">{formatZl(saldo.damianPaid)}</Row><Row label="Zapłaciła firma">{formatZl(saldo.firmaPaid)}</Row><p className="pv-notice">{tekstSalda(saldo, formatZl)}</p>{oldPanel("koszty", "Pełne rozliczenie wspólników")}</>; })()}
      {section === "raporty" && <>{podatkiRoku(snapshot).filter(t => source.miesiace?.[t.miesiac]).map(t => <details key={t.miesiac}><summary><span>{POLSKIE_MIESIACE[t.miesiac]} 2026</span><strong>{formatZl(t.cashflowPoPodatkach)}</strong></summary><Row label="Przychód netto">{formatZl(t.przychodNetto)}</Row><Row label="Koszty podatkowe">{formatZl(t.kosztyPodatkowe)}</Row><Row label="Podatek dochodowy">{formatZl(t.pitMiesiac)}</Row></details>)}{oldPanel("raport", "Eksport raportów")}</>}
      {section === "wiadomosci" && <>{(snapshot.notatki ?? []).filter(n => n.miesiac === month).map(n => <details key={n.id}><summary>{n.kanal === "kierowca" ? "Wątek kierowcy" : "Administratorzy"} · {n.autor}</summary><p className="pv-message">{n.tresc}</p></details>)}{!(snapshot.notatki ?? []).some(n => n.miesiac === month) && <p className="pv-empty">Brak wiadomości w tym miesiącu.</p>}{oldPanel("wiadomosci", "Pisanie wiadomości")}</>}
      {section === "ustawienia" && <>
        <Row label="Forma opodatkowania">{settings.taxForm === "skala" ? "Skala podatkowa" : "Podatek liniowy"}</Row><Row label="Tryb rozliczenia">{settings.incomeTaxScope === "company_division" ? "Odgałęzienie firmy" : "Samodzielne"}</Row><Row label="Domyślny VAT sprzedaży">{settings.defaultSalesVatRate * 100}%</Row>
        {go("kierowcy", live ? "Umowa i składki Rafała" : "Warunki Rafała · test", "90 zł za kurs, urlop według listy płac", { driver: "rafal", part: "umowa" })}{oldPanel("ustawienia", "Zmiana ustawień")}
      </>}
    </main>
    <footer>Odczyt danych{updatedAt && Number.isFinite(Date.parse(updatedAt)) ? ` z ${new Date(updatedAt).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" })}` : ""}.{!live && <> Bez zapisu do bazy.{hasDrafts && <span> Dni Rafała: niezapisane dane testowe.</span>}</>}</footer>
  </div>;
}
