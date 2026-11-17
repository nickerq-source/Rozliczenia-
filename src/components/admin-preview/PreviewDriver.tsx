"use client";

import { useState } from "react";
import type { DaneMiesiaca, MiesiącId, UstawieniaPodatkowe } from "@/lib/types";
import type { PreviewDay, PreviewLocation } from "@/lib/admin-preview";
import { previewDayNet } from "@/lib/admin-preview";
import { formatZl, obliczWynagrodzenie, obliczWynikMiesiaca } from "@/lib/business-logic";
import { getDniMiesiaca } from "@/lib/dates";
import { TYP_DNIA_LABEL } from "@/lib/day-type";
import { IconPlus } from "../ui/icons";

const statuses: Record<PreviewDay["status"], string> = { praca: "Praca", praca_zlecenia: "Praca + zlecenia", urlop: "Urlop płatny", postojowe: "Postojowe", wolne: "Wolne" };
const amount = (value: string) => value.trim() === "" ? null : Number(value.replace(",", "."));
const validAmount = (n: number | null) => n === null || (Number.isFinite(n) && n >= 0 && n <= 1000000);

export function PreviewDriver({ driver, part, onPart, month, dane, settings, drafts, onDrafts }: {
  driver: "zenia" | "rafal";
  part: PreviewLocation["part"];
  onPart: (part: PreviewLocation["part"]) => void;
  month: MiesiącId;
  dane: DaneMiesiaca;
  settings: UstawieniaPodatkowe;
  drafts: PreviewDay[];
  onDrafts: (days: PreviewDay[]) => void;
}) {
  const [editing, setEditing] = useState<PreviewDay | null>(null);
  const [error, setError] = useState("");
  const isTrial = driver === "rafal";
  const salary = obliczWynagrodzenie(month, dane.dni);
  const result = obliczWynikMiesiaca(month, dane, settings);
  const openEditor = (day?: PreviewDay) => {
    setError("");
    setEditing(day ?? { date: getDniMiesiaca(month)[0], status: "praca", courses: 0, ordersNet: null, leaveNet: null, note: "" });
  };
  const line = (label: string, value: string) => <div className="pv-row"><span>{label}</span><strong>{value}</strong></div>;
  return <>
    <h1>{isTrial ? "Rafał Gustab" : "Żenia · Yevhenii Pitianin"}</h1>
    {isTrial && <p className="pv-notice">Profil testowy. Wpisy są tylko w pamięci tej karty i nie wchodzą do rozliczeń firmy.</p>}
    <div className="pv-tabs" aria-label="Dane kierowcy">
      {([ ["dni", "Dni pracy"], ["wyplata", "Wypłata"], ["umowa", "Umowa"] ] as const).map(([id, label]) =>
        <button key={id} type="button" aria-pressed={part === id} onClick={() => { setEditing(null); onPart(id); }}>{label}</button>)}
    </div>
    {part === "dni" && <>
      {isTrial ? <>
        <button className="pv-command" onClick={() => openEditor()}><IconPlus size={16} aria-hidden />Dodaj dzień testowy</button>
        {editing && <form className="pv-form" onSubmit={e => {
          e.preventDefault();
          if (!getDniMiesiaca(month).includes(editing.date) || !Number.isInteger(editing.courses) || editing.courses < 0 || editing.courses > 100 || !validAmount(editing.ordersNet) || !validAmount(editing.leaveNet)) {
            setError("Sprawdź datę miesiąca, liczbę kursów (0–100) i nieujemne kwoty."); return;
          }
          onDrafts([...drafts.filter(d => d.date !== editing.date), { ...editing }].sort((a, b) => a.date.localeCompare(b.date)));
          setEditing(null);
        }}>
          <h2>Dzień Rafała · niezapisany w bazie</h2>
          <div className="pv-fields">
            <label>Data<input type="date" value={editing.date} min={getDniMiesiaca(month)[0]} max={getDniMiesiaca(month).at(-1)} required onChange={e => setEditing({ ...editing, date: e.target.value })} /></label>
            <label>Status<select aria-label="Status dnia" value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value as PreviewDay["status"] })}>{Object.entries(statuses).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            {(editing.status === "praca" || editing.status === "praca_zlecenia") && <label>Kursy · 90 zł netto<input type="number" min="0" max="100" step="1" required value={editing.courses} onChange={e => setEditing({ ...editing, courses: Number(e.target.value) })} /></label>}
            {editing.status === "praca_zlecenia" && <label>Zlecenia · kwota netto<input inputMode="decimal" type="number" min="0" max="1000000" step="0.01" value={editing.ordersNet ?? ""} onChange={e => setEditing({ ...editing, ordersNet: amount(e.target.value) })} /></label>}
            {editing.status === "urlop" && <label>Urlop · netto z listy płac<input inputMode="decimal" type="number" min="0" max="1000000" step="0.01" value={editing.leaveNet ?? ""} onChange={e => setEditing({ ...editing, leaveNet: amount(e.target.value) })} /></label>}
          </div>
          {editing.status === "postojowe" && <p>Założenie testowe: 50 zł netto. Do uzgodnienia z listą płac.</p>}
          <label>Komentarz<textarea maxLength={1000} value={editing.note} onChange={e => setEditing({ ...editing, note: e.target.value })} /></label>
          {error && <p role="alert">{error}</p>}
          <div className="pv-actions"><button className="pv-command" type="submit">Zastosuj tylko w podglądzie</button><button type="button" onClick={() => setEditing(null)}>Anuluj</button></div>
        </form>}
        {!drafts.length && <p className="pv-empty">Brak dni testowych w tym miesiącu.</p>}
        {drafts.map(day => <button className="pv-list-row" key={day.date} onClick={() => openEditor(day)}><span>{day.date.slice(8)}.{day.date.slice(5, 7)} · {statuses[day.status]}<small>{day.status.startsWith("praca") ? `${day.courses} kursów` : day.note || "Wpis testowy"}</small></span><strong>{previewDayNet(day) === null ? "Do uzupełnienia" : formatZl(previewDayNet(day)!)}</strong></button>)}
      </> : <>
        {!Object.keys(dane.dni).length && <p className="pv-empty">Brak zapisanych dni pracy.</p>}
        {Object.entries(dane.dni).sort(([a], [b]) => a.localeCompare(b)).map(([date, day]) => <details key={date}><summary><span>{date.slice(8)}.{date.slice(5, 7)} · {TYP_DNIA_LABEL[day.dayType ?? "pracujacy"]}</span><strong>{formatZl(salary.dniowki[date]?.dniowka ?? 0)}</strong></summary>
          {line("Kursy", String(day.kolka ?? 0))}{line("Zlecenia", String(day.zlecenia ?? 0))}{line("Kwota zleceń", formatZl(salary.dniowki[date]?.kwotaZlecen ?? 0))}
        </details>)}
      </>}
    </>}
    {part === "wyplata" && (isTrial ? <>
      {line("Suma wpisów testowych", !drafts.length ? "Brak danych" : drafts.some(d => previewDayNet(d) === null) ? "Niepełne dane" : formatZl(drafts.reduce((sum, d) => sum + (previewDayNet(d) ?? 0), 0)))}
      {line("Zatwierdzona lista płac", "Brak danych")}{line("Koszt zatrudnienia", "Nieustalony")}
      <p className="pv-empty">Naliczenie testowe nie jest zatwierdzoną wypłatą. Nie dodaje się go drugi raz do podstawy z umowy.</p>
    </> : <>
      {line("Wynagrodzenie naliczone", formatZl(salary.wynagrodzenie))}{line("Potrącenia", formatZl(result.potraceniaKierowcy))}
      {line("Do wypłaty po potrąceniach", formatZl(result.wynagrodzenieDoWyplaty))}{line("Status", dane.wyplata?.status === "wypłacone" ? "Wypłacone" : "Niewypłacone")}
      <details><summary>Koszt pracownika w obecnym rozliczeniu</summary>{line("Zobowiązania za pracownika", formatZl(result.obciazeniaPracownika))}{line("Łącznie z wypłatą", formatZl(result.obciazeniaPracownika + result.wynagrodzenieDoWyplaty))}</details>
    </>)}
    {part === "umowa" && (isTrial ? <>
      {line("Rodzaj", "Umowa o pracę")}{line("Za kurs na rękę", "90,00 zł")}{line("Postojowe · założenie", "50,00 zł netto")}{line("Urlop", "Według listy płac")}{line("Stawka zleceń", "Do ustalenia")}{line("Podstawa brutto z umowy", "Do uzupełnienia")}
    </> : <>{line("Oficjalne wynagrodzenie brutto · ustawienia", formatZl(settings.pracownikBruttoMies))}{line("Uwzględnianie części oficjalnej", settings.pracownikOficjalnyEnabled ? "Włączone" : "Wyłączone")}<p className="pv-empty">Odczyt istniejących ustawień. Podgląd nie zmienia zasad rozliczenia.</p></>)}
  </>;
}
