import type { ReactNode } from "react";
import { POLSKIE_MIESIACE } from "@/lib/dates";
import type { MiesiącId } from "@/lib/types";
import { formatZl } from "@/lib/business-logic";
import { IconCheck, IconAlertTriangle, IconLoader, IconNotes } from "../ui/icons";

export type PayrollSaveState = "idle" | "saving" | "saved" | "dirty" | "error" | "conflict" | "locked";
const messages: Record<PayrollSaveState, string> = {
  idle: "Brak zmian do zapisania", saving: "Zapisywanie dni…", saved: "Wszystkie zmiany zapisane",
  dirty: "Niezapisane zmiany", error: "Nie zapisano zmian", conflict: "Konflikt zapisu", locked: "Miesiąc zamknięty",
};

export function PayrollLine({ label, value, total }: { label: string; value: number; total?: boolean }) {
  return <div className={total ? "pv-payroll-total" : "pv-row"}><span>{label}</span><strong>{formatZl(value)}</strong></div>;
}

export function SaveDaysButton({ disabled, form, onSave }: { disabled: boolean; form?: string; onSave?: () => void }) {
  return <button type={form ? "submit" : "button"} form={form} onClick={onSave} disabled={disabled} className="fc-save-command"><IconCheck size={16} aria-hidden="true" />Zapisz dni</button>;
}

export function PayrollCloseout({ person, month, children, state, message, disabled, onSave, form, extraAction }: {
  person: string; month: MiesiącId; children: ReactNode; state: PayrollSaveState;
  message?: string; disabled: boolean; onSave?: () => void; form?: string; extraAction?: ReactNode;
}) {
  const Icon = state === "error" || state === "conflict" ? IconAlertTriangle : state === "saving" ? IconLoader : state === "dirty" ? IconNotes : IconCheck;
  return <section aria-label={`Podsumowanie wypłaty ${person}`} className="fc-closeout rf-pay-summary">
    <h2>Podsumowanie wypłaty · {POLSKIE_MIESIACE[month]}</h2>
    {children}
    <div className="fc-savebar">
      <span role="status" data-state={state}><Icon size={16} aria-hidden="true" />{message ?? messages[state]}</span>
      <div className="fc-save-actions">{extraAction}<SaveDaysButton disabled={disabled} form={form} onSave={onSave} /></div>
    </div>
  </section>;
}
