"use client";

import { useState } from "react";
import type { PDFImportDiagnosticRow, PDFRecordOverride } from "@/lib/types";
import { invoiceDate, isAdditionalInvoiceRow, parseMoneyCents } from "@/lib/invoice-settlement";
import { IconCheck } from "./ui/icons";

export type InvoiceCorrection = NonNullable<PDFRecordOverride["correction"]>;

export function InvoiceRowCorrection({ row, onSave, onCancel }: {
  row: PDFImportDiagnosticRow; onSave: (correction: InvoiceCorrection) => void; onCancel: () => void;
}) {
  const [driverName, setDriverName] = useState(row.driverName);
  const [vehicleType, setVehicleType] = useState(row.vehicleType);
  const [date, setDate] = useState(row.date ?? "");
  const [cost, setCost] = useState(row.needsReview && !row.source?.cells.cost ? "" : String(row.cost));
  const [km, setKm] = useState(String(row.km));
  const [kind, setKind] = useState(row.orderKind ?? (row.needsReview ? "" : isAdditionalInvoiceRow(row) ? "I" : "D"));
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const input = "block w-full min-w-0 rounded-lg border border-line bg-input px-2 py-2 text-sm text-white";
  function save() {
    const cents = parseMoneyCents(cost);
    const distance = Number(km.replace(",", "."));
    if (!driverName.trim() || !/^\d+\/\d+$/.test(vehicleType.trim()) || !invoiceDate(date) || cents === null || cents < 0 ||
      !km.trim() || !Number.isFinite(distance) || distance < 0 || (kind !== "D" && kind !== "I") || !confirmed) {
      setError("Uzupełnij poprawne dane i potwierdź sprawdzenie z PDF."); return;
    }
    onSave({ driverName: driverName.trim(), vehicleType: vehicleType.trim(), date, cost: cents / 100, km: distance, orderKind: kind });
  }
  return <div className="space-y-3 border-t border-line pt-3">
    <label className="block">Kierowca<input className={input} value={driverName} onChange={e => setDriverName(e.target.value)} /></label>
    <div className="grid grid-cols-2 gap-2">
      <label className="min-w-0">Typ transportu<input className={input} value={vehicleType} onChange={e => setVehicleType(e.target.value)} /></label>
      <label className="min-w-0">Data załadunku<input type="date" className={input} value={date} onChange={e => setDate(e.target.value)} /></label>
      <label>Potwierdzone netto<input inputMode="decimal" className={input} value={cost} onChange={e => setCost(e.target.value)} /></label>
      <label>Odległość (km)<input inputMode="decimal" className={input} value={km} onChange={e => setKm(e.target.value)} /></label>
    </div>
    <label className="block">Rodzaj pozycji<select className={input} value={kind} onChange={e => setKind(e.target.value)}>
      <option value="">Wybierz</option><option value="D">/D - trasa</option><option value="I">/I - zlecenie</option>
    </select></label>
    <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Dane sprawdzone z oryginalnym PDF</label>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className="flex items-center gap-1 rounded-lg bg-amber-brand px-3 py-2 font-bold text-amber-ink" onClick={save}><IconCheck size={14} />Zastosuj korektę</button>
      <button type="button" className="px-3 py-2 text-zinc-300" onClick={onCancel}>Anuluj</button>
    </div>
  </div>;
}
