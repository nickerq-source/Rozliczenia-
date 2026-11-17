"use client";

import { useEffect, useRef, useState } from "react";
import type { DaneMiesiaca, MiesiącId } from "@/lib/types";
import { fleetDayNet, rafalMonthCost, type FleetDay } from "@/lib/fleet";
import { validateFleetDay, type FleetCommand } from "@/lib/fleet-commands";
import { calendarDraftConflicts, mergeCalendarDrafts, restoreCalendarDrafts, sameCalendarDay, type CalendarDrafts } from "@/lib/rafal-calendar";
import { formatZl } from "@/lib/business-logic";
import { getDniMiesiaca, getDayOfWeek, isNiedziela, isSobota, nazwaSkrotDnia, POLSKIE_MIESIACE } from "@/lib/dates";
import { IconCheck, IconNotes, IconX } from "../ui/icons";

const statuses: [FleetDay["status"], string, string][] = [
  ["praca", "P", "Praca"], ["praca_zlecenia", "P+Z", "Praca + zlecenia"], ["urlop", "U", "Urlop płatny"],
  ["postojowe", "PS", "Postojowe"], ["wolne", "W", "Wolne"],
];
const emptyDay = (date: string): FleetDay => ({ date, status: "praca", courses: 0, ordersNet: null, leaveNet: null, note: "" });
const money = (value: string) => value === "" ? null : Number(value.replace(",", "."));

export function RafalWorkCalendar({ month, dane, token, busy, save }: {
  month: MiesiącId; dane: DaneMiesiaca; token: string; busy: boolean;
  save: (command: FleetCommand) => Promise<boolean>;
}) {
  const [drafts, setDrafts] = useState<CalendarDrafts>({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [notes, setNotes] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const initial = useRef(dane.rafal?.days ?? []);
  const storageKey = `papitrans:rafal-calendar:${token}:${month}`;
  const saved = dane.rafal?.days ?? [];
  const dates = getDniMiesiaca(month);
  const pending = Object.keys(drafts).length;
  const conflicts = calendarDraftConflicts(drafts, saved);
  const displayed = mergeCalendarDrafts(drafts, saved);
  const validDays = displayed.filter(day => { try { validateFleetDay(day, month); return true; } catch { return false; } });
  const invalidDays = displayed.length !== validDays.length;
  const cost = rafalMonthCost(month, { rafal: { ...dane.rafal, days: validDays } });
  const disabled = !ready || saving || busy || !!dane.zamkniety?.locked;
  const conflictText = conflicts.length ? `Dni zmieniono w innym zapisie: ${conflicts.join(", ")}. Odrzuć szkic i sprawdź zapisane dane przed ponowną edycją.` : "";

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) setDrafts(restoreCalendarDrafts(raw, month, initial.current));
    } catch { setStorageError("Nie udało się przywrócić lokalnego szkicu dni. Sprawdź zapisane dane."); }
    setReady(true);
  }, [storageKey, month]);
  useEffect(() => {
    if (!ready) return;
    try {
      if (pending) sessionStorage.setItem(storageKey, JSON.stringify(drafts));
      else sessionStorage.removeItem(storageKey);
    } catch { setStorageError("Przeglądarka nie zachowuje szkicu. Zapisz zmiany przed opuszczeniem miesiąca."); }
  }, [drafts, pending, ready, storageKey]);
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  function change(date: string, patch: Partial<FleetDay>) {
    setError("");
    setDrafts(previous => {
      const base = previous[date] ? previous[date].base : saved.find(day => day.date === date) ?? null;
      const value = { ...(previous[date]?.value ?? base ?? emptyDay(date)), ...patch };
      const next = { ...previous, [date]: { base, value } };
      if (sameCalendarDay(base, value)) delete next[date];
      return next;
    });
  }
  async function submit() {
    if (disabled || savingRef.current || !pending || conflicts.length) return;
    setError("");
    const changed = Object.values(drafts).map(draft => draft.value);
    try { for (const day of changed) validateFleetDay(day, month); }
    catch (err) { setError(err instanceof Error ? err.message : "Sprawdź wpisane dni."); return; }
    savingRef.current = true; setSaving(true);
    try {
      if (await save({ kind: "days", month, days: changed })) {
        setDrafts({});
        try { sessionStorage.removeItem(storageKey); } catch { /* In-memory state is still cleared after confirmed save. */ }
      } else setError("Nie zapisano dni. Wpisane wartości pozostają w szkicu. Sprawdź komunikat zapisu i spróbuj ponownie.");
    } catch { setError("Nie udało się zapisać dni. Wpisane wartości pozostają w szkicu."); }
    finally { savingRef.current = false; setSaving(false); }
  }
  const saveButton = <button type="submit" className="pv-command" disabled={disabled || !pending || !!conflicts.length}><IconCheck size={16} />{saving ? "Zapisywanie…" : "Zapisz dni"}</button>;
  const row = (label: string, value: number) => <div className="pv-row"><span>{label}</span><strong>{formatZl(value)}</strong></div>;

  return <form className="rf-calendar" onSubmit={e => { e.preventDefault(); void submit(); }} aria-label="Dni i wypłata Rafała">
    <div className="rf-heading"><div><h2>Wypłata kierowcy</h2><p>{POLSKIE_MIESIACE[month]} 2026</p></div>{saveButton}</div>
    <p className="rf-rates">Kółko: <strong>90 zł netto</strong> · Postojowe: <strong>50 zł netto</strong></p>
    <div className="rf-legend">{statuses.map(([id, short, label]) => <span key={id}><b data-status={id}>{short}</b> {label}</span>)}</div>
    <p role="status" className="rf-save-status">{!ready ? "Wczytywanie dni…" : saving ? "Zapisywanie dni…" : pending ? `Niezapisane dni: ${pending}` : "Wszystkie zmiany zapisane"}</p>
    {dane.zamkniety?.locked && <p className="pv-notice">Miesiąc zamknięty. Edycja jest zablokowana.</p>}
    {(error || conflictText) && <p role="alert">{error || conflictText}</p>}
    {invalidDays && <p role="alert">Sprawdź kursy (0–100) i kwoty z dokładnością do grosza. Błędne dni nie są uwzględnione w podglądzie sumy.</p>}
    {storageError && <p role="alert">{storageError}</p>}
    <fieldset disabled={disabled}>
      <div role="table" aria-label="Dni pracy kierowcy">
        <div className="rf-columns" role="row"><span role="columnheader">Dzień</span><span role="columnheader">Typ dnia</span><span role="columnheader">Kółka</span><span role="columnheader">Dniówka</span></div>
        {dates.map((date, index) => {
          const entry = displayed.find(day => day.date === date);
          const day = entry ?? emptyDay(date);
          const working = day.status === "praca" || day.status === "praca_zlecenia";
          const daily = entry && validDays.includes(entry) ? fleetDayNet(day) : null;
          const noteOpen = notes[date] ?? !!day.note;
          return <div key={date}>
            {index > 0 && getDayOfWeek(date) === 1 && <div className="rf-week">Tydzień {Math.floor((index + (getDayOfWeek(dates[0]) + 6) % 7) / 7) + 1}</div>}
            <div role="row" data-testid={`rafal-day-${date}`} className={`rf-day ${isNiedziela(date) ? "rf-sunday" : isSobota(date) ? "rf-saturday" : ""} ${daily && daily > 0 ? "rf-active" : ""} ${drafts[date] ? "rf-dirty" : ""}`}>
              <div role="rowheader" className="rf-date"><strong>{Number(date.slice(8))}</strong> <span>{nazwaSkrotDnia(date)}</span></div>
              <div role="cell" className="rf-status"><select aria-label={`Status ${date}`} title={statuses.find(([id]) => id === entry?.status)?.[2] ?? "Typ dnia"} data-status={entry?.status} value={entry?.status ?? ""} onChange={e => change(date, { status: e.target.value as FleetDay["status"] })}><option value="" disabled>Brak wpisu</option>{statuses.map(([id, short, label]) => <option key={id} value={id}>{entry?.status === id ? short : `${short} · ${label}`}</option>)}</select></div>
              <div role="cell" className="rf-courses"><span className="rf-input-label">Kółka</span>{working ? <input aria-label={`Kursy ${date}`} type="number" inputMode="numeric" min="0" max="100" step="1" placeholder="0" value={day.courses || ""} onChange={e => change(date, { courses: Number(e.target.value) })} /> : <span className="rf-day-off" data-status={day.status}>{statuses.find(([id]) => id === day.status)?.[1]}</span>}</div>
              <div role="cell" className="rf-amount"><div><span className="rf-input-label">Dniówka</span><strong>{daily === null ? entry ? "Brak kwoty" : "—" : formatZl(daily)}</strong></div><button type="button" className="rf-note-button" aria-label={`Komentarz ${date}`} title={`Komentarz ${date}`} aria-expanded={noteOpen} onClick={() => setNotes(prev => ({ ...prev, [date]: !noteOpen }))}><IconNotes size={16} /></button></div>
              {(day.status === "praca_zlecenia" || day.status === "urlop" || noteOpen) && <div role="cell" className="rf-extra">
                {day.status === "praca_zlecenia" && <label>Zlecenia netto (zł)<input aria-label={`Zlecenia ${date}`} inputMode="decimal" type="number" min="0" max="10000000" step="0.01" value={day.ordersNet ?? ""} onChange={e => change(date, { ordersNet: money(e.target.value) })} /></label>}
                {day.status === "urlop" && <label>Urlop netto z listy płac (zł)<input aria-label={`Urlop ${date}`} inputMode="decimal" type="number" min="0" max="10000000" step="0.01" value={day.leaveNet ?? ""} onChange={e => change(date, { leaveNet: money(e.target.value) })} /></label>}
                {noteOpen && <label>Komentarz<textarea aria-label={`Treść komentarza ${date}`} maxLength={1000} value={day.note} onChange={e => change(date, { note: e.target.value })} /></label>}
              </div>}
            </div>
          </div>;
        })}
      </div>
    </fieldset>
    <section aria-label="Podsumowanie wypłaty Rafała" className="rf-pay-summary">
      <h2>Podsumowanie wypłaty · {POLSKIE_MIESIACE[month]}</h2>
      {pending > 0 && <p className="pv-notice">Podgląd z niezapisanymi dniami</p>}
      {row("Zarobione z dni i kursów", cost.calculated)}
      {row("Oficjalna część · netto z umowy", cost.payrollNet)}
      {row("Pozostała wypłata ponad netto umowy", cost.additionalPayout)}
      {cost.payrollNet > cost.calculated && row("Uzupełnienie do netto z umowy", Math.round((cost.payrollNet - cost.calculated) * 100) / 100)}
      <div className="pv-payroll-total"><span>Razem do wypłaty</span><strong>{formatZl(cost.payout)}</strong></div>
      {row("Podatek i składki z umowy", cost.charges)}
      <div className="pv-payroll-total"><span>Łączny koszt z podatkiem i składkami</span><strong>{formatZl(cost.total)}</strong></div>
      <details><summary>Szczegóły umowy</summary>
        {row("Brutto z umowy", cost.payroll?.gross ?? 0)}
        {row("Podatek dochodowy pracownika", cost.payroll?.employeeIncomeTax ?? 0)}
        {row("Składka zdrowotna pracownika", cost.payroll?.employeeHealth ?? 0)}
        {row("Składki społeczne pracownika", cost.payroll?.employeeSocial ?? 0)}
        {row("Składki pracodawcy", cost.payroll?.employerContributions ?? 0)}
        {row("Pozostałe potrącenia do przekazania", cost.payroll?.otherDeductions ?? 0)}
        {row("Koszt umowy uznany do podatku firmy", cost.taxCost)}
      </details>
      {cost.estimated && <p className="pv-muted">Umowa: szacunek od najniższej krajowej, pełny etat i miesiąc.</p>}
      {cost.incomplete && <p className="pv-notice">Niepełne rozliczenie: sprawdź kwoty urlopu, zleceń lub listę płac.</p>}
      <div className="pv-actions">{saveButton}{pending > 0 && <button type="button" title="Odrzuć niezapisane zmiany" aria-label="Odrzuć niezapisane zmiany" disabled={!ready || saving || busy} onClick={() => { if (window.confirm("Odrzucić niezapisane dni Rafała? Zapisane dane pozostaną bez zmian.")) { setDrafts({}); setError(""); } }}><IconX size={20} /></button>}</div>
    </section>
  </form>;
}
