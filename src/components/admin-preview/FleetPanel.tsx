"use client";

import { useRef, useState } from "react";
import type { DaneMiesiaca, MiesiącId, WorkspaceData } from "@/lib/types";
import { rafalMonthCost, type RafalPayroll, type RafalPayrollSettings } from "@/lib/fleet";
import { prepareFleetInvoice, validatePayroll, validatePayrollSettings, type FleetCommand } from "@/lib/fleet-commands";
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

function ManualPayroll({ month, dane, save, busy }: { month: MiesiącId; dane: DaneMiesiaca; save: Save; busy: boolean }) {
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
    <p className="pv-muted">Koszt podatkowy z listy płac: brutto + składki pracodawcy. Podatek i składki: według wpisanych kwot.</p>
    {error && <p role="alert">{error}</p>}
    <button className="pv-command" disabled={busy || dane.zamkniety?.locked}>Zapisz listę płac</button>
  </form>;
}

export function Payroll({ month, dane, save, busy }: { month: MiesiącId; dane: DaneMiesiaca; save: Save; busy: boolean }) {
  const [error, setError] = useState("");
  const cost = rafalMonthCost(month, dane);
  const settings = cost.settings;
  const automatic = settings.mode === "minimum";
  const payroll = cost.payroll ?? cost.minimumCalculation;
  const row = (label: string, value: number | undefined) => <div className="pv-row"><span>{label}</span><strong>{value === undefined ? "Brak danych" : formatZl(value)}</strong></div>;
  return <section aria-label="Rozliczenie umowy Rafała">
    <h2>{automatic ? "Najniższa krajowa · 2026" : "Umowa · dane z listy płac"}</h2>
    {automatic && <p className="pv-muted">Szacunek: pełny etat, pełny miesiąc, bez PPK i ulg podatkowych. PIT-2: {settings.taxReduction} zł. Koszty uzyskania: {settings.taxCosts} zł.</p>}
    {!settings.enabled && <p className="pv-notice">Umowa nie jest ujęta w kosztach tego miesiąca.</p>}
    {row("Podstawa brutto umowy", payroll?.gross)}
    {row("Podatek dochodowy pracownika", payroll?.employeeIncomeTax)}
    {row("Składka zdrowotna pracownika", payroll?.employeeHealth)}
    {row("Składki społeczne pracownika", payroll?.employeeSocial)}
    {row("Składki pracodawcy", payroll?.employerContributions)}
    {row("Netto z umowy o pracę", payroll?.net)}
    {row("Zarobione z dni i kursów", cost.calculated)}
    {row("Pozostała wypłata", cost.additionalPayout)}
    {row("Wypłata ujęta w kosztach", cost.payout)}
    {row("Razem koszt w PapiTrans", cost.total)}
    <details>
      <summary>Ustawienia umowy · {POLSKIE_MIESIACE[month]}</summary>
      <form className="pv-form" key={JSON.stringify(settings)} onSubmit={async e => {
        e.preventDefault(); setError("");
        const values = new FormData(e.currentTarget);
        const updated: RafalPayrollSettings = {
          mode: values.get("mode") as RafalPayrollSettings["mode"],
          enabled: values.get("enabled") === "on",
          taxReduction: Number(values.get("taxReduction")) as RafalPayrollSettings["taxReduction"],
          taxCosts: Number(values.get("taxCosts")) as RafalPayrollSettings["taxCosts"],
          taxRate: Number(values.get("taxRate")) as RafalPayrollSettings["taxRate"],
          accidentRate: Number(String(values.get("accidentRate")).replace(",", ".")),
          labourFund: values.get("labourFund") === "on",
          guaranteedBenefitsFund: values.get("guaranteedBenefitsFund") === "on",
          deductibleThisMonth: values.get("deductibleThisMonth") === "on",
        };
        try { validatePayrollSettings(updated); await save({ kind: "payrollSettings", month, settings: updated }); }
        catch (err) { setError(err instanceof Error ? err.message : "Sprawdź ustawienia umowy."); }
      }}>
        <label className="pv-check"><input name="enabled" type="checkbox" defaultChecked={settings.enabled} />Umowa aktywna w tym miesiącu</label>
        <label>Rozliczenie<select name="mode" aria-label="Rozliczenie" defaultValue={settings.mode}><option value="minimum">Najniższa krajowa · automatycznie</option><option value="manual">Własna lista płac · wyjątek</option></select></label>
        <div className="pv-fields">
          <label>PIT-2 w tej firmie<select name="taxReduction" aria-label="PIT-2 w tej firmie" defaultValue={settings.taxReduction}><option value="0">Bez pomniejszenia</option><option value="100">100 zł miesięcznie</option><option value="150">150 zł miesięcznie</option><option value="300">300 zł miesięcznie</option></select></label>
          <label>Koszty uzyskania pracownika<select name="taxCosts" aria-label="Koszty uzyskania pracownika" defaultValue={settings.taxCosts}><option value="250">250 zł · standardowe</option><option value="300">300 zł · dojazd z innej miejscowości</option><option value="0">Bez kosztów</option></select></label>
          <label>Stawka podatku pracownika<select name="taxRate" aria-label="Stawka podatku pracownika" defaultValue={settings.taxRate}><option value="12">12%</option><option value="32">32%</option></select></label>
          <label>Składka wypadkowa (%)<input name="accidentRate" type="number" min="0" max="10" step="0.01" inputMode="decimal" required defaultValue={settings.accidentRate} /></label>
        </div>
        <label className="pv-check"><input name="labourFund" type="checkbox" defaultChecked={settings.labourFund} />Fundusz Pracy i Fundusz Solidarnościowy</label>
        <label className="pv-check"><input name="guaranteedBenefitsFund" type="checkbox" defaultChecked={settings.guaranteedBenefitsFund} />FGŚP</label>
        <label className="pv-check"><input name="deductibleThisMonth" type="checkbox" defaultChecked={settings.deductibleThisMonth} />Ujmuj automatyczne wyliczenie w kosztach podatkowych miesiąca</label>
        {error && <p role="alert">{error}</p>}
        <button className="pv-command" disabled={busy || dane.zamkniety?.locked}>Zapisz ustawienia umowy</button>
      </form>
    </details>
    {!automatic && <ManualPayroll month={month} dane={dane} save={save} busy={busy} />}
  </section>;
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
