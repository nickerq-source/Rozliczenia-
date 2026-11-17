"use client";

import { useEffect, useId, useRef, useState } from "react";
import { PayrollCloseout, PayrollLine, SaveDaysButton } from "./PayrollCloseout";
import type { SaveStatus } from "@/hooks/useWorkspace";
import type { DaneMiesiaca, MiesiącId } from "@/lib/types";
import { fleetDayNet, rafalMonthCost, RAFAL_KOLKO, RAFAL_POSTOJOWE, type FleetDay } from "@/lib/fleet";
import { validateFleetDay, type FleetCommand } from "@/lib/fleet-commands";
import { calendarDraftConflicts, mergeCalendarDrafts, restoreCalendarDrafts, sameCalendarDay, type CalendarDrafts } from "@/lib/rafal-calendar";
import { PayrollCalendar } from "./PayrollCalendar";
import { IconNotes, IconX } from "../ui/icons";

const statuses: [FleetDay["status"], string, string][] = [
  ["praca", "P", "Praca"], ["praca_zlecenia", "P+Z", "Praca + zlecenia"], ["urlop", "U", "Urlop płatny"],
  ["postojowe", "PS", "Postojowe"], ["wolne", "W", "Wolne"],
];
const emptyDay = (date: string): FleetDay => ({ date, status: "praca", courses: 0, ordersNet: null, leaveNet: null, note: "" });
const money = (value: string) => value === "" ? null : Number(value.replace(",", "."));

export function RafalWorkCalendar({ month, dane, token, busy, save, status }: {
  month: MiesiącId; dane: DaneMiesiaca; token: string; busy: boolean;
  save: (command: FleetCommand) => Promise<boolean>; status: SaveStatus;
}) {
  const formId = useId();
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
    if (disabled || savingRef.current || !pending || conflicts.length || status === "conflict") return;
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
  const saveButton = <SaveDaysButton form={formId} disabled={disabled || !pending || !!conflicts.length || status === "conflict"} />;
  const row = (label: string, value: number) => <PayrollLine label={label} value={value} />;

  return <form id={formId} className="space-y-4" onSubmit={e => { e.preventDefault(); void submit(); }} aria-label="Dni i wypłata Rafała">
    <PayrollCalendar driver="rafal" month={month} legend={statuses} action={saveButton} disabled={disabled}
      rates={<>Kółko: <strong>{RAFAL_KOLKO} zł netto</strong> · Postojowe: <strong>{RAFAL_POSTOJOWE} zł netto</strong></>}
      notice={<>
        {dane.zamkniety?.locked && <p className="pv-notice">Miesiąc zamknięty. Edycja jest zablokowana.</p>}
        {(error || conflictText) && <p role="alert">{error || conflictText}</p>}
        {invalidDays && <p role="alert">Sprawdź kursy (0–100) i kwoty z dokładnością do grosza. Błędne dni nie są uwzględnione w podglądzie sumy.</p>}
        {storageError && <p role="alert">{storageError}</p>}
      </>}
      dayCells={date => {
        const entry = displayed.find(day => day.date === date);
        const day = entry ?? emptyDay(date);
        const working = day.status === "praca" || day.status === "praca_zlecenia";
        const amount = entry && validDays.includes(entry) ? fleetDayNet(day) : null;
        const noteOpen = notes[date] ?? !!day.note;
        return {
          amount, active: (amount ?? 0) > 0, missingAmount: !!entry, marked: !!drafts[date],
          status: <select aria-label={`Status ${date}`} title={statuses.find(([id]) => id === entry?.status)?.[2] ?? "Typ dnia"} data-status={entry?.status} value={entry?.status ?? ""} onChange={e => change(date, { status: e.target.value as FleetDay["status"] })}><option value="" disabled>Brak wpisu</option>{statuses.map(([id, short, label]) => <option key={id} value={id}>{entry?.status === id ? short : `${short} · ${label}`}</option>)}</select>,
          courses: working ? <input aria-label={`Kursy ${date}`} type="number" inputMode="numeric" min="0" max="100" step="1" placeholder="0" value={day.courses || ""} onChange={e => change(date, { courses: Number(e.target.value) })} /> : <span className="rf-day-off" data-status={day.status}>{statuses.find(([id]) => id === day.status)?.[1]}</span>,
          amountAction: <button type="button" className="rf-note-button" aria-label={`Komentarz ${date}`} title={`Komentarz ${date}`} aria-expanded={noteOpen} onClick={() => setNotes(prev => ({ ...prev, [date]: !noteOpen }))}><IconNotes size={16} /></button>,
          extra: (day.status === "praca_zlecenia" || day.status === "urlop" || noteOpen) && <>
            {day.status === "praca_zlecenia" && <label>Zlecenia netto (zł)<input aria-label={`Zlecenia ${date}`} inputMode="decimal" type="number" min="0" max="10000000" step="0.01" value={day.ordersNet ?? ""} onChange={e => change(date, { ordersNet: money(e.target.value) })} /></label>}
            {day.status === "urlop" && <label>Urlop netto z listy płac (zł)<input aria-label={`Urlop ${date}`} inputMode="decimal" type="number" min="0" max="10000000" step="0.01" value={day.leaveNet ?? ""} onChange={e => change(date, { leaveNet: money(e.target.value) })} /></label>}
            {noteOpen && <label>Komentarz<textarea aria-label={`Treść komentarza ${date}`} maxLength={1000} value={day.note} onChange={e => change(date, { note: e.target.value })} /></label>}
          </>,
        };
      }}
    />
    <div className="admin-preview driver-embedded">
    <PayrollCloseout person="Rafała" month={month} form={formId} disabled={disabled || !pending || !!conflicts.length || status === "conflict"}
      state={dane.zamkniety?.locked ? "locked" : status === "conflict" || conflicts.length ? "conflict" : saving ? "saving" : error ? "error" : pending ? "dirty" : status}
      message={!ready ? "Wczytywanie dni…" : pending && !error && !conflicts.length && !saving && !dane.zamkniety?.locked && status !== "conflict" ? `Niezapisane dni: ${pending}` : undefined}
      extraAction={pending > 0 && <button type="button" title="Odrzuć niezapisane zmiany" aria-label="Odrzuć niezapisane zmiany" disabled={!ready || saving || busy} onClick={() => { if (window.confirm("Odrzucić niezapisane dni Rafała? Zapisane dane pozostaną bez zmian.")) { setDrafts({}); setError(""); } }}><IconX size={20} /></button>}>
      {pending > 0 && <p className="pv-notice">Podgląd z niezapisanymi dniami</p>}
      {row("Zarobione z dni i kursów", cost.calculated)}
      {row("Oficjalna część · netto z umowy", cost.payrollNet)}
      {row("Pozostała wypłata ponad netto umowy", cost.additionalPayout)}
      {cost.payrollNet > cost.calculated && row("Uzupełnienie do netto z umowy", Math.round((cost.payrollNet - cost.calculated) * 100) / 100)}
      <PayrollLine label="Razem do wypłaty" value={cost.payout} total />
      {row("Podatek i składki z umowy", cost.charges)}
      <PayrollLine label="Łączny koszt z podatkiem i składkami" value={cost.total} total />
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
    </PayrollCloseout></div>
  </form>;
}
