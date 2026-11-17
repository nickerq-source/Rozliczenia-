"use client";

import { useRef, useState } from "react";
import type { DaneMiesiaca, MiesiącId, WorkspaceData } from "@/lib/types";
import type { RafalPayroll } from "@/lib/fleet";
import { prepareFleetInvoice, validatePayroll, type FleetCommand } from "@/lib/fleet-commands";
import { savedInvoicePreview, type InvoicePreview } from "@/lib/invoice-import";
import { formatZl } from "@/lib/business-logic";
import { POLSKIE_MIESIACE } from "@/lib/dates";
import { AdminPreview } from "./AdminPreview";
import { ImportModal } from "../ImportModal";
import { IconPlus } from "../ui/icons";

type Save = (command: FleetCommand) => Promise<boolean>;
const payrollFields = [
  ["gross", "Brutto z listy płac"], ["net", "Netto do wypłaty z listy płac"],
  ["employeeIncomeTax", "Podatek dochodowy pracownika"], ["employeeHealth", "Składka zdrowotna pracownika"],
  ["employeeSocial", "Składki społeczne pracownika"], ["employerContributions", "Składki finansowane przez pracodawcę"],
  ["otherDeductions", "Pozostałe potrącenia do przekazania"],
] as const;

function Payroll({ month, dane, save, busy }: { month: MiesiącId; dane: DaneMiesiaca; save: Save; busy: boolean }) {
  const [error, setError] = useState("");
  return <form className="pv-form" key={JSON.stringify(dane.rafal?.payroll)} onSubmit={async e => {
    e.preventDefault(); setError("");
    const form = new FormData(e.currentTarget);
    const payroll = Object.fromEntries(payrollFields.map(([key]) => [key, Number(String(form.get(key)).replace(",", "."))])) as unknown as RafalPayroll;
    payroll.reference = String(form.get("reference") ?? "");
    payroll.deductibleThisMonth = form.get("deductible") === "on";
    try { validatePayroll(payroll); await save({ kind: "payroll", month, payroll }); }
    catch (err) { setError(err instanceof Error ? err.message : "Sprawdź dane listy płac."); }
  }}>
    <h2>Lista płac · {POLSKIE_MIESIACE[month]}</h2>
    <div className="pv-fields">{payrollFields.map(([key, label]) => <label key={key}>{label}<input name={key} type="number" inputMode="decimal" min="0" max="10000000" step="0.01" required defaultValue={dane.rafal?.payroll?.[key] ?? ""} /></label>)}</div>
    <label>Numer / opis listy płac<input name="reference" maxLength={200} required defaultValue={dane.rafal?.payroll?.reference ?? ""} /></label>
    <label className="pv-check"><input name="deductible" type="checkbox" defaultChecked={dane.rafal?.payroll?.deductibleThisMonth ?? false} />Koszt podatkowy potwierdzony dla tego miesiąca</label>
    <p className="pv-muted">Koszt podatkowy: brutto + składki pracodawcy, bez ponownego doliczania potrąceń z brutto. Różnica względem ewidencji dni wymaga uzgodnienia z listą płac.</p>
    {error && <p role="alert">{error}</p>}
    <button className="pv-command" disabled={busy || dane.zamkniety?.locked}>Zapisz listę płac</button>
  </form>;
}

function FleetInvoices({ month, dane, save, busy }: { month: MiesiącId; dane: DaneMiesiaca; save: Save; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ value: InvoicePreview; name: string; number: string | null; id?: string } | null>(null);
  const locked = !!dane.zamkniety?.locked;
  return <section className="pv-invoice-import">
    <h2>Wspólne faktury · Żenia i Rafał</h2>
    <button className="pv-command" disabled={loading || busy || locked} onClick={() => input.current?.click()}><IconPlus size={16} />{loading ? "Odczytywanie PDF…" : "Dodaj fakturę PDF"}</button>
    <input ref={input} hidden type="file" accept="application/pdf,.pdf" onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = "";
      if (!file) return;
      setLoading(true); setError("");
      try {
        const form = new FormData(); form.set("file", file); form.set("mode", "fleet");
        const response = await fetch("/api/import-invoice", { method: "POST", body: form });
        const json = await response.json();
        if (!response.ok || !json.filtered) throw new Error(json.error || json.message || "Nie udało się odczytać PDF.");
        setPreview({ value: prepareFleetInvoice(json.filtered), name: file.name, number: json.invoiceNumber });
      } catch (err) { setError(err instanceof Error ? err.message : "Nie udało się odczytać PDF."); }
      finally { setLoading(false); }
    }} />
    {locked && <p className="pv-notice">Miesiąc zamknięty.</p>}
    {error && <p role="alert">{error}</p>}
    <details><summary>Popraw podział zapisanej faktury</summary>{dane.faktury.filter(f => f.pdfImport).map(invoice => <button className="pv-list-row" key={invoice.id} disabled={busy || locked} onClick={() => {
      setError("");
      try { setPreview({ value: prepareFleetInvoice(savedInvoicePreview(invoice.pdfImport!)), name: invoice.pdfImport!.nazwaPliku, number: invoice.pdfImport!.numerFaktury, id: invoice.id }); }
      catch (err) { setError(err instanceof Error ? err.message : "Wgraj dokument ponownie."); }
    }}><span>{invoice.label}<small>{invoice.pdfImport!.numerFaktury}</small></span><span>Sprawdź podział</span></button>)}</details>
    {preview && <ImportModal invoiceNumber={preview.number} fileName={preview.name} filtered={preview.value} busy={busy} message={error || `Zapis do: ${POLSKIE_MIESIACE[month]} 2026. Pozycje obu kierowców tworzą jeden przychód firmy. Bez zmian w dniówkach.`} onCancel={() => { if (!busy) setPreview(null); }} onConfirm={async updated => {
      if (!updated || busy) return;
      try {
        const checked = prepareFleetInvoice(updated);
        const old = dane.faktury.find(f => f.id === preview.id);
        if (!window.confirm(`${old ? `Zaktualizować fakturę (poprzednio ${formatZl(old.kwota)})` : "Zapisać fakturę"} za ${POLSKIE_MIESIACE[month]}? Nowa kwota: ${formatZl(checked.brutto)} brutto.`)) return;
        const ok = await save({ kind: "invoice", month, id: preview.id, preview: checked, fileName: preview.name, number: preview.number });
        if (ok) setPreview(null); else setError("Nie zapisano faktury. Zamknij podgląd, aby zobaczyć komunikat zapisu i odświeżyć dane.");
      } catch (err) { setError(err instanceof Error ? err.message : "Sprawdź dane faktury."); }
    }} />}
  </section>;
}

export function FleetPanel({ source, updatedAt }: { source: WorkspaceData; updatedAt: string }) {
  const [state, setState] = useState({ data: source, revision: updatedAt });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const save: Save = async command => {
    if (inFlight.current) return false;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/fleet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: state.revision, command }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Nie zapisano zmian.");
      setState({ data: json.data, revision: json.updated_at }); setMessage(`Zapisano. ${json.message}`); return true;
    } catch (err) { setError(err instanceof Error ? err.message : "Brak połączenia. Zmiany nie zostały potwierdzone."); return false; }
    finally { inFlight.current = false; setBusy(false); }
  };
  const last = [...(state.data.fleetHistory ?? [])].reverse().find(entry => !entry.undoneAt);
  return <AdminPreview source={state.data} updatedAt={state.revision} live={{ busy, onSaveDay: (month, day) => save({ kind: "day", month, day }),
    payroll: (month, dane) => <Payroll key={month} month={month} dane={dane} save={save} busy={busy} />,
    invoices: (month, dane) => <FleetInvoices key={month} month={month} dane={dane} save={save} busy={busy} />,
    toolbar: <div className="pv-save-status">
      <p role="status">{busy ? "Zapisywanie…" : message || "Dane pobrane z bazy"}</p>
      {error && <p role="alert">{error} <button onClick={() => { if (window.confirm("Odświeżyć panel? Niezapisane pola formularza zostaną utracone.")) window.location.reload(); }}>Odśwież dane</button></p>}
      <details><summary>Historia zmian i cofanie</summary>
        {last && <button className="pv-command" disabled={busy} onClick={() => { if (window.confirm(`Cofnąć ostatnią zmianę: ${last.description}?`)) void save({ kind: "undo", id: last.id }); }}>Cofnij: {last.description}</button>}
        {[...(state.data.fleetHistory ?? [])].reverse().map(entry => <p key={entry.id}><strong>{entry.description}</strong><br />{entry.actor} · {new Date(entry.at).toLocaleString("pl-PL")}{entry.undoneAt && ` · cofnięto przez ${entry.undoneBy}`}</p>)}
        {!state.data.fleetHistory?.length && <p>Brak zapisanych zmian.</p>}
      </details>
    </div>,
  }} />;
}
