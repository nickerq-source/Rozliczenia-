"use client";

import { useRef, useState, type ReactNode } from "react";
import type { DaneMiesiaca, MiesiącId, UstawieniaPodatkowe } from "@/lib/types";
import { DRIVER_PARTS, PREVIEW_DRIVERS, previewDayNet, previewDriverEntries, type PreviewDay, type PreviewDriverId, type PreviewLocation, type PreviewSection } from "@/lib/admin-preview";
import { czyTankowanieWliczane, formatZl, parseNum, obliczWynagrodzenie, obliczWynikMiesiaca } from "@/lib/business-logic";
import { getDniMiesiaca, nazwaSkrotDnia, isSobota, isNiedziela } from "@/lib/dates";
import { maKolka, typDniaMeta } from "@/lib/day-type";
import { rozbijWpis } from "@/lib/tax";
import { sumMoney } from "@/lib/invoice-settlement";
import { IconPlus, IconUsers, IconChevronDown } from "../ui/icons";

const statuses: Record<PreviewDay["status"], { label: string; short: string }> = {
  praca: { label: "Praca", short: "P" }, praca_zlecenia: { label: "Praca + zlecenia", short: "P+Z" },
  urlop: { label: "Urlop płatny", short: "U" }, postojowe: { label: "Postojowe", short: "PS" }, wolne: { label: "Wolne", short: "W" },
};
const amount = (value: string) => value.trim() === "" ? null : Number(value.replace(",", "."));
const validAmount = (n: number | null) => n === null || (Number.isFinite(n) && n >= 0 && n <= 1000000);
const line = (label: string, value: string) => <div className="pv-row"><span>{label}</span><strong>{value}</strong></div>;

export function PreviewDriver({ driver, part, onPart, month, dane, available, settings, drafts, onDrafts, onCompany, live, embedded }: {
  embedded?: boolean;
  driver: PreviewDriverId;
  part: PreviewLocation["part"];
  onPart: (part: PreviewLocation["part"]) => void;
  month: MiesiącId;
  dane: DaneMiesiaca;
  available: boolean;
  settings: UstawieniaPodatkowe;
  drafts: PreviewDay[];
  onDrafts: (days: PreviewDay[]) => void;
  onCompany: (section: PreviewSection) => void;
  live?: { busy: boolean; saveDay: (day: PreviewDay) => Promise<boolean>; payroll: ReactNode };
}) {
  const [editing, setEditing] = useState<PreviewDay | null>(null);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const editor = useRef<HTMLFormElement>(null);
  const dayDetails = useRef<HTMLElement>(null);
  const isTrial = driver === "rafal";
  const salary = obliczWynagrodzenie(month, dane.dni);
  const result = obliczWynikMiesiaca(month, dane, settings);
  const entries = previewDriverEntries(dane, driver);
  const days = getDniMiesiaca(month);
  const trialComplete = drafts.length > 0 && drafts.every(d => previewDayNet(d) !== null);
  const trialNet = trialComplete ? sumMoney(drafts.map(d => previewDayNet(d)!)) : null;
  const payrollLabel = isTrial ? live ? "Zarobione z dni · netto" : "Naliczenie testowe" : "Do wypłaty po potrąceniach";
  const accrualValue = trialNet !== null ? formatZl(trialNet) : drafts.length ? "Niepełne dane" : "Brak wpisów";
  const payrollValue = isTrial ? accrualValue : available ? formatZl(result.wynagrodzenieDoWyplaty) : "Brak danych";
  const courses = isTrial ? drafts.filter(d => d.status.startsWith("praca")).reduce((sum, d) => sum + d.courses, 0) : days.reduce((sum, date) => sum + (maKolka(dane.dni[date]?.dayType) ? parseNum(dane.dni[date]?.kolka) : 0), 0);
  const openEditor = (day?: PreviewDay) => {
    setError("");
    setEditing(day ?? { date: days.find(date => !drafts.some(d => d.date === date)) ?? days[0], status: "praca", courses: 0, ordersNet: null, leaveNet: null, note: "" });
    requestAnimationFrame(() => editor.current?.scrollIntoView({ block: "center" }));
  };

  return <>
    {!embedded && <div className="pv-driver-title"><IconUsers size={24} aria-hidden /><div><h1>{PREVIEW_DRIVERS[driver]}</h1><p>{isTrial ? "Umowa o pracę · 90 zł na rękę za kurs" : "Żenia · obecne rozliczenie"}</p></div></div>}
    {isTrial && !live && <p className="pv-notice">Dni i wypłata: próba bez zapisu. Nie wpływa na koszty ani podatki firmy.</p>}
    {isTrial && live && dane.zamkniety?.locked && <p className="pv-notice">Miesiąc zamknięty. Edycja jest zablokowana.</p>}
    {!embedded && <nav className="pv-driver-tabs" aria-label="Działy kierowcy">
      {DRIVER_PARTS.map(([id, label]) => <button key={id} aria-current={part === id ? "page" : undefined} onClick={() => { setEditing(null); setSelectedDate(null); onPart(id); }}>{label}</button>)}
    </nav>}

    {part === "podsumowanie" && <>
      <h2>Podsumowanie kierowcy</h2>
      <div className="pv-driver-metrics"><div><span>{payrollLabel}</span><strong>{payrollValue}</strong></div><div><span>Kółka w ewidencji</span><strong>{isTrial && !drafts.length || !isTrial && !available ? "Brak danych" : courses}</strong></div></div>
      {line("Przypisane pozycje z faktur · netto", entries.invoices.length ? formatZl(entries.assignedNet) : "Brak przypisania")}
      {line("Zgłoszone tankowania", String(entries.fuel.length))}
      <button className="pv-list-row" onClick={() => onPart("dni")}><span>Dni pracy i rozliczenie wypłaty</span><IconChevronDown className="pv-chevron" size={16} aria-hidden /></button>
      <button className="pv-list-row" onClick={() => onPart("faktury")}><span>Pozycje kierowcy z faktur</span><IconChevronDown className="pv-chevron" size={16} aria-hidden /></button>
    </>}

    {part === "dni" && <>
      <div className="pv-section-heading"><h2>Dni i wypłata</h2>{isTrial && <button className="pv-command" onClick={() => openEditor()}><IconPlus size={16} aria-hidden />Dodaj dzień</button>}</div>
      <div className="pv-payroll-total"><span>{payrollLabel}</span><strong>{payrollValue}</strong></div>
      <details><summary>Rozliczenie wypłaty</summary>{isTrial ? <>
        {line(live ? "Naliczenie z dni" : "Suma wpisów testowych", accrualValue)}
        {line("Netto z umowy o pracę", result.rafal.payroll ? formatZl(result.rafal.payrollNet) : "Brak danych")}
        {live && <>
          {line("Pozostała wypłata", result.rafal.payroll ? formatZl(result.rafal.additionalPayout) : "Brak podziału")}
          {line("Wypłata ujęta w kosztach", formatZl(result.rafal.payout))}
          {line("Podatek i składki z umowy", formatZl(result.rafal.charges))}
          {result.rafal.estimated && <p className="pv-muted">Umowa: szacunek od najniższej krajowej, pełny etat i miesiąc. Wypłata w kosztach nie jest niższa niż netto z umowy.</p>}
        </>}
        {line("Koszt zatrudnienia", live ? `${formatZl(result.rafal.total)}${result.rafal.incomplete ? " · niepełny" : ""}` : "Nieustalony")}
      </> : available ? <>
        {line("Suma dniówek", formatZl(salary.sumaDniowek))}{line("Premia", formatZl(salary.premia))}{line("Wynagrodzenie naliczone", formatZl(salary.wynagrodzenie))}{line("Potrącenia", formatZl(result.potraceniaKierowcy))}
        {line("Do wypłaty", formatZl(result.wynagrodzenieDoWyplaty))}{line("Status", dane.wyplata?.status === "wypłacone" ? "Wypłacone" : "Niewypłacone")}
      </> : <p>Brak zapisanych danych.</p>}</details>
      {editing && <form ref={editor} className="pv-form" onSubmit={async e => {
        e.preventDefault();
        if (!days.includes(editing.date) || !Number.isInteger(editing.courses) || editing.courses < 0 || editing.courses > 100 || !validAmount(editing.ordersNet) || !validAmount(editing.leaveNet)) {
          setError("Sprawdź datę miesiąca, liczbę kursów (0–100) i nieujemne kwoty."); return;
        }
        if (live) { if (!await live.saveDay(editing)) return; }
        else onDrafts([...drafts.filter(d => d.date !== editing.date), { ...editing }].sort((a, b) => a.date.localeCompare(b.date)));
        setEditing(null);
      }}>
        <h2>{live ? "Dzień Rafała" : "Dzień Rafała · wpis testowy"}</h2>
        <div className="pv-fields">
          <label>Data<input type="date" value={editing.date} min={days[0]} max={days.at(-1)} required onChange={e => setEditing({ ...editing, date: e.target.value })} /></label>
          <label>Status<select aria-label="Status dnia" value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value as PreviewDay["status"] })}>{Object.entries(statuses).map(([id, status]) => <option key={id} value={id}>{status.label}</option>)}</select></label>
          {editing.status.startsWith("praca") && <label>Kursy · 90 zł netto<input type="number" min="0" max="100" step="1" required value={editing.courses} onChange={e => setEditing({ ...editing, courses: Number(e.target.value) })} /></label>}
          {editing.status === "praca_zlecenia" && <label>Zlecenia · kwota netto<input inputMode="decimal" type="number" min="0" max="1000000" step="0.01" value={editing.ordersNet ?? ""} onChange={e => setEditing({ ...editing, ordersNet: amount(e.target.value) })} /></label>}
          {editing.status === "urlop" && <label>Urlop · netto z listy płac<input inputMode="decimal" type="number" min="0" max="1000000" step="0.01" value={editing.leaveNet ?? ""} onChange={e => setEditing({ ...editing, leaveNet: amount(e.target.value) })} /></label>}
        </div>
        {editing.status === "postojowe" && <p>Postojowe: 50 zł netto. Do uzgodnienia z listą płac.</p>}
        <label>Komentarz<textarea maxLength={1000} value={editing.note} onChange={e => setEditing({ ...editing, note: e.target.value })} /></label>
        {error && <p role="alert">{error}</p>}
        <div className="pv-actions"><button className="pv-command" type="submit" disabled={live?.busy || (live && dane.zamkniety?.locked)}>{live ? live.busy ? "Zapisywanie…" : "Zapisz dzień" : "Zastosuj tylko w podglądzie"}</button><button type="button" onClick={() => setEditing(null)}>Anuluj</button></div>
      </form>}
      {!isTrial && selectedDate && salary.dniowki[selectedDate] && <section ref={dayDetails} className="pv-day-details" aria-label="Szczegóły dnia">
        <h2>{selectedDate} · {typDniaMeta(dane.dni[selectedDate]?.dayType).label}</h2>
        {line("Kwota za kółka", formatZl(salary.dniowki[selectedDate].kwotaKolek))}{line("Kwota zleceń", formatZl(salary.dniowki[selectedDate].kwotaZlecen))}
        {line("Szkolenie", formatZl(salary.dniowki[selectedDate].szkolenie))}{line("Dodatek niedzielny", formatZl(salary.dniowki[selectedDate].dodatekNiedzielny))}{line("Urlop", formatZl(salary.dniowki[selectedDate].urlop))}
        <button onClick={() => setSelectedDate(null)}>Zamknij szczegóły</button>
      </section>}
      <table className="pv-calendar" aria-label="Dni pracy kierowcy">
        <thead><tr><th>Dzień</th><th>Status</th><th>Kółka</th><th>Dniówka</th></tr></thead>
        <tbody>{days.map(date => {
          const trial = drafts.find(day => day.date === date);
          const legacy = dane.dni[date];
          const exists = isTrial ? !!trial : available && !!legacy;
          const meta = trial ? statuses[trial.status] : legacy ? { label: typDniaMeta(legacy.dayType).label, short: typDniaMeta(legacy.dayType).krotki } : null;
          const net = isTrial ? trial ? previewDayNet(trial) : null : exists ? salary.dniowki[date]?.dniowka ?? 0 : null;
          const label = `${date.slice(8)} ${nazwaSkrotDnia(date)}`;
          return <tr key={date} className={isNiedziela(date) ? "pv-sunday" : isSobota(date) ? "pv-saturday" : undefined}>
            <th scope="row">{isTrial ? <button aria-label={`Edytuj dzień ${date}`} onClick={() => openEditor(trial ?? { date, status: "praca", courses: 0, ordersNet: null, leaveNet: null, note: "" })}>{label}</button> : exists ? <button aria-label={`Szczegóły dnia ${date}`} onClick={() => { setSelectedDate(date); requestAnimationFrame(() => dayDetails.current?.scrollIntoView({ block: "center" })); }}>{label}</button> : label}</th>
            <td>{exists && meta ? <abbr title={meta.label}>{meta.short}</abbr> : <span className="pv-muted">Brak wpisu</span>}</td>
            <td>{exists ? isTrial ? trial!.status.startsWith("praca") ? trial!.courses : "—" : maKolka(legacy.dayType) ? legacy.kolka : "—" : "—"}</td>
            <td>{net !== null ? formatZl(net) : exists ? "Brak kwoty" : "—"}</td>
          </tr>;
        })}</tbody>
      </table>
      {!isTrial && <a className="pv-old-link" href={`/admin?miesiac=${month}&zakladka=koszty`}>Edycja dni Żeni w obecnym panelu</a>}
    </>}

    {part === "faktury" && <>
      <h2>Pozycje kierowcy z faktur</h2>
      {line("Zapisane, przypisane pozycje · netto", entries.invoices.length ? formatZl(entries.assignedNet) : "Brak przypisania")}
      <p className="pv-muted">Tylko uwzględnione pozycje z nazwiskiem kierowcy. To przychód firmy, nie wypłata kierowcy ani pełna kwota wspólnej faktury.</p>
      {entries.invoices.map(group => <details key={group.invoice.id}><summary>{group.invoice.label}<strong>{formatZl(group.netto)} netto</strong></summary>
        {group.rows.map((row, index) => <div key={`${row.orderNumber}-${index}`} className="pv-source-entry"><strong>{row.date ?? "Brak daty"} · {row.orderNumber}</strong><p>{row.additionalDescription || row.notes || row.route || "Brak opisu"}</p><span>{formatZl(row.cost)} netto</span></div>)}
        {group.additions.map(row => <div key={row.id} className="pv-source-entry"><strong>{row.date} · dodatek ręczny</strong><p>{row.description || row.type}</p><span>{formatZl(row.netto)} netto</span></div>)}
      </details>)}
      <button className="pv-old-link" onClick={() => onCompany("faktury")}>Wszystkie faktury firmy i pozycje bez przypisania</button>
    </>}

    {part === "paliwo" && <>
      <h2>Tankowania zgłoszone przez kierowcę</h2>
      {!entries.fuel.length && <p className="pv-empty">Brak tankowań z potwierdzonym autorem dla tego kierowcy.</p>}
      {entries.fuel.map(fuel => <details key={fuel.id}><summary>{fuel.expenseDate || fuel.data} · {fuel.stationName || "Tankowanie"}<strong>{formatZl(rozbijWpis(fuel, settings, "paliwo_adblue").brutto)} brutto</strong></summary>
        {line("Status", fuel.status === "pending" ? "Do zatwierdzenia" : fuel.status === "rejected" ? "Odrzucone" : "Zapisane")}{line("Wliczone do wyniku firmy", czyTankowanieWliczane(fuel) ? "Tak" : "Nie")}
        {line("Litry", fuel.litry === undefined ? "Brak danych" : String(fuel.litry))}<p>{fuel.opis || fuel.note}</p>
      </details>)}
      <p className="pv-muted">Koszty auta i leasing bez przypisania do kierowcy pozostają w kosztach firmy.</p>
      <button className="pv-old-link" onClick={() => onCompany("koszty")}>Koszty firmy i zatwierdzanie tankowań</button>
    </>}

    {part === "umowa" && <>
      <h2>Umowa i koszty pracownika</h2>
      {isTrial ? <>
        {live?.payroll}
        {line("Rodzaj", "Umowa o pracę")}{line("Za kurs na rękę", "90,00 zł")}{line("Postojowe", "50,00 zł netto")}{line("Urlop", "Według listy płac")}{line("Zlecenia", "Kwota wpisana dla dnia")}{!live && line("Podstawa brutto z umowy", "Do uzupełnienia")}{line("Składki i podatek pracownika", live && result.rafal.settings.mode === "minimum" ? "Automatycznie od najniższej krajowej" : "Według listy płac")}
      </> : <>
        {line("Oficjalne wynagrodzenie brutto · ustawienia", formatZl(settings.pracownikBruttoMies))}
        {available && <>{line("Podatek dochodowy pracownika", formatZl(result.podatekDochodowyPracownika))}{line("Zdrowotna pracownika", formatZl(result.skladkaZdrowotnaPracownika))}{line("Pozostałe składki ZUS", formatZl(result.pozostaleSkladkiZusPracownika))}{line("Wypłata i zobowiązania pracownika", formatZl(result.wynagrodzenieDoWyplaty + result.obciazeniaPracownika))}</>}
      </>}
    </>}
  </>;
}
