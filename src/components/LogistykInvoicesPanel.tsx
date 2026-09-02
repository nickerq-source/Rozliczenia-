"use client";

import { useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type {
  FakturaZlecenLog,
  PDFImportData,
  PDFImportDiagnosticRow,
} from "@/lib/types";
import { formatZl } from "@/lib/business-logic";
import { Card, CardTitle } from "./ui/Card";
import {
  IconChevronDown,
  IconLoader,
  IconPackage,
  IconPaperclip,
  IconTrash,
} from "./ui/icons";

interface ImportedInvoiceResponse {
  invoiceNumber?: string | null;
  error?: string;
  message?: string;
  filtered?: Omit<PDFImportData, "nazwaPliku" | "numerFaktury" | "pozycjeUwzglednione" | "pozycjeOdrzucone"> & {
    includedRows?: PDFImportDiagnosticRow[];
    rejectedRows?: PDFImportDiagnosticRow[];
    sourceRows?: PDFImportDiagnosticRow[];
  };
}

interface InvoicePreview {
  fileName: string;
  invoiceNumber: string | null;
  rows: PDFImportDiagnosticRow[];
  filtered: NonNullable<ImportedInvoiceResponse["filtered"]>;
}

const r2 = (value: number) => Math.round(value * 100) / 100;

function isOrderRow(row: PDFImportDiagnosticRow): boolean {
  return row.isAdditional === true
    && Boolean(row.date)
    && Number.isFinite(Number(row.cost))
    && Number(row.cost) > 0;
}

function orderDescription(row: PDFImportDiagnosticRow): string {
  return row.additionalDescription?.trim()
    || row.notes?.trim()
    || (row.orderNumber ? `Zlecenie ${row.orderNumber}` : "Zlecenie z faktury");
}

export function LogistykInvoicesPanel({
  invoices,
  enabled,
  onAdd,
  onDelete,
}: {
  invoices: FakturaZlecenLog[];
  enabled: boolean;
  onAdd: (invoice: FakturaZlecenLog) => void;
  onDelete: (invoice: FakturaZlecenLog) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<InvoicePreview | null>(null);

  const invoiceNumbers = useMemo(
    () => new Set(invoices.map((invoice) => invoice.numerFaktury?.trim()).filter(Boolean)),
    [invoices]
  );
  const fileNames = useMemo(
    () => new Set(invoices.map((invoice) => invoice.nazwaPliku.trim().toLocaleLowerCase("pl-PL"))),
    [invoices]
  );

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setPreview(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/import-invoice", { method: "POST", body: formData });
      const json = await response.json() as ImportedInvoiceResponse;
      if (!response.ok) throw new Error(json.error || "Nie udało się odczytać faktury.");
      if (!json.filtered) throw new Error(json.message || "W fakturze nie znaleziono pozycji.");

      const rows = (json.filtered.sourceRows ?? []).filter(isOrderRow);
      if (rows.length === 0) {
        throw new Error("W fakturze nie znaleziono zleceń z opisem lub oznaczeniem /I.");
      }
      if (json.invoiceNumber && invoiceNumbers.has(json.invoiceNumber.trim())) {
        throw new Error(`Faktura ${json.invoiceNumber} jest już zapisana w tym miesiącu.`);
      }
      if (!json.invoiceNumber && fileNames.has(file.name.trim().toLocaleLowerCase("pl-PL"))) {
        throw new Error(`Plik ${file.name} jest już zapisany w tym miesiącu.`);
      }

      setPreview({
        fileName: file.name,
        invoiceNumber: json.invoiceNumber ?? null,
        rows,
        filtered: json.filtered,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się odczytać faktury.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function savePreview() {
    if (!preview) return;
    const netto = r2(preview.rows.reduce((sum, row) => sum + Number(row.cost), 0));
    const sumaKm = r2(preview.rows.reduce((sum, row) => sum + Number(row.km || 0), 0));
    const dates = preview.rows.map((row) => row.date).filter((date): date is string => Boolean(date)).sort();
    const brutto = r2(netto * 1.23);
    const pdfImport: PDFImportData = {
      nazwaPliku: preview.fileName,
      numerFaktury: preview.invoiceNumber,
      filters: preview.filtered.filters,
      invoiceImportDateFrom: dates[0] ?? null,
      invoiceImportDateTo: dates.at(-1) ?? null,
      ileKolek: 0,
      ileZlecen: preview.rows.length,
      kolkaNetto: 0,
      kolkaBrutto: 0,
      zleceniaNetto: netto,
      zleceniaBrutto: brutto,
      sumaKm,
      netto,
      brutto,
      sredniaKm: r2(sumaKm / preview.rows.length),
      sredniaNetto: r2(netto / preview.rows.length),
      sredniaBrutto: r2(brutto / preview.rows.length),
      zakresOd: dates[0] ?? null,
      zakresDo: dates.at(-1) ?? null,
      pozycjeUwzglednione: preview.rows,
      pozycjeOdrzucone: [],
      sourceRows: preview.rows,
    };

    onAdd({
      id: uuidv4(),
      nazwaPliku: preview.fileName,
      numerFaktury: preview.invoiceNumber,
      plate: "KK8108N",
      kierowca: "Damian",
      importedAt: new Date().toISOString(),
      pdfImport,
    });
    setPreview(null);
  }

  function remove(invoice: FakturaZlecenLog) {
    const label = invoice.numerFaktury || invoice.nazwaPliku;
    if (!window.confirm(`Usunąć fakturę ${label} i wszystkie pobrane z niej zlecenia?`)) return;
    onDelete(invoice);
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <IconPackage size={18} className="text-amber-brand" />
          <CardTitle className="mb-0">Osobne faktury Damiana</CardTitle>
        </div>
        <p className="mb-3 text-[11px] text-dim">
          System pobiera z PDF zlecenia, opisy i kwoty netto. Te faktury służą wyłącznie do rozliczenia logistyka i nie zwiększają przychodu ani VAT firmy.
        </p>

        {!enabled ? (
          <p className="mb-3 rounded-xl border border-amber-brand/40 bg-amber-brand/10 px-3 py-2 text-[11px] text-amber-brand">
            Liczenie tych faktur jest obecnie wyłączone w ustawieniach miesiąca. Możesz je zapisać, ale nie wejdą do sumy do czasu włączenia opcji.
          </p>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-brand/60 px-3 py-2.5 text-sm font-bold text-amber-brand hover:bg-amber-brand/10 disabled:opacity-50"
        >
          {uploading ? <IconLoader size={16} /> : <IconPaperclip size={16} />}
          {uploading ? "Odczytuję fakturę…" : "Dodaj PDF Damiana"}
        </button>

        {error ? (
          <p className="mt-3 rounded-xl border border-red-500/40 bg-red-soft px-3 py-2 text-sm text-red-300">{error}</p>
        ) : null}
      </Card>

      {preview ? (
        <Card>
          <CardTitle className="mb-1">Sprawdź przed zapisem</CardTitle>
          <p className="text-xs text-dim">
            {preview.invoiceNumber ? `Faktura ${preview.invoiceNumber}` : preview.fileName} · Damian (KK8108N)
          </p>
          <div className="mt-3 divide-y divide-line/50 border-y border-line/60">
            {preview.rows.map((row, index) => (
              <div key={`${row.orderNumber}-${row.date}-${index}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2 py-2 text-xs">
                <span className="tabular-nums text-dim">{row.date || "brak daty"}</span>
                <span className="break-words text-ink">{orderDescription(row)}</span>
                <span className="tabular-nums font-bold text-white">{formatZl(row.cost)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-sm font-bold">
            <span className="text-white">Razem netto</span>
            <span className="tabular-nums text-amber-brand">
              {formatZl(preview.rows.reduce((sum, row) => sum + Number(row.cost), 0))}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setPreview(null)} className="rounded-xl border border-line py-2.5 text-sm font-bold text-dim hover:text-ink">
              Anuluj
            </button>
            <button type="button" onClick={savePreview} className="rounded-xl bg-amber-brand py-2.5 text-sm font-bold text-amber-ink hover:bg-[#e09420]">
              Zapisz fakturę
            </button>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardTitle className="mb-2">Zapisane faktury ({invoices.length})</CardTitle>
        {invoices.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface2/60 px-3 py-6 text-center text-sm text-dim">
            Brak osobnych faktur Damiana w tym miesiącu.
          </p>
        ) : (
          <div className="divide-y divide-line/60">
            {invoices.map((invoice) => (
              <details key={invoice.id} className="group py-2">
                <summary className="flex cursor-pointer list-none items-center gap-2">
                  <IconChevronDown size={14} className="shrink-0 text-dim transition-transform group-open:rotate-180" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{invoice.numerFaktury || invoice.nazwaPliku}</p>
                    <p className="text-[10px] text-dim">
                      {invoice.pdfImport.sourceRows?.length ?? 0} zleceń · {formatZl(invoice.pdfImport.zleceniaNetto ?? invoice.pdfImport.netto)} netto
                    </p>
                  </div>
                  <button
                    type="button"
                    title="Usuń fakturę"
                    onClick={(event) => {
                      event.preventDefault();
                      remove(invoice);
                    }}
                    className="shrink-0 rounded-lg p-2 text-red-400 hover:bg-red-soft"
                  >
                    <IconTrash size={15} />
                  </button>
                </summary>
                <div className="ml-6 mt-2 divide-y divide-line/40 border-t border-line/50">
                  {(invoice.pdfImport.sourceRows ?? []).map((row, index) => (
                    <div key={`${row.orderNumber}-${row.date}-${index}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2 py-2 text-[11px]">
                      <span className="tabular-nums text-dim">{row.date}</span>
                      <span className="break-words text-ink">{orderDescription(row)}</span>
                      <span className="tabular-nums font-bold text-white">{formatZl(row.cost)}</span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
