import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const apply = process.argv.includes("--apply");
const files = process.argv.slice(2).filter((value) => value !== "--apply");
const importUrl = process.env.IMPORT_INVOICE_URL ?? "http://localhost:3000/api/import-invoice";

if (files.length === 0) {
  throw new Error("Podaj ścieżki plików PDF. Dodaj --apply, aby zapisać zmiany.");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Brakuje NEXT_PUBLIC_SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY.");
}

const parsedByInvoiceNumber = new Map();
for (const filePath of files) {
  if (!fs.existsSync(filePath)) throw new Error(`Nie znaleziono pliku: ${filePath}`);

  const form = new FormData();
  form.append(
    "file",
    new Blob([fs.readFileSync(filePath)], { type: "application/pdf" }),
    path.basename(filePath)
  );
  const response = await fetch(importUrl, { method: "POST", body: form });
  const payload = await response.json();
  if (!response.ok || !payload.invoiceNumber || !payload.filtered?.sourceRows) {
    throw new Error(`Nie udało się sparsować ${path.basename(filePath)}: ${payload.error ?? "brak danych"}`);
  }
  if (parsedByInvoiceNumber.has(String(payload.invoiceNumber))) {
    throw new Error(`Powtórzony numer faktury: ${payload.invoiceNumber}`);
  }
  parsedByInvoiceNumber.set(String(payload.invoiceNumber), payload.filtered.sourceRows);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: workspaces, error: readError } = await admin.from("workspaces").select("id,data");
if (readError) throw readError;

function mergeDescriptions(rows, parsedRowsByOrder) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => {
    const parsed = parsedRowsByOrder.get(String(row.orderNumber ?? ""));
    const description = String(parsed?.additionalDescription ?? "").trim();
    return description ? { ...row, additionalDescription: description } : row;
  });
}

const matchCounts = new Map([...parsedByInvoiceNumber.keys()].map((number) => [number, 0]));
const updates = [];
const report = [];

for (const workspace of workspaces ?? []) {
  const nextData = structuredClone(workspace.data ?? {});
  let changed = false;

  for (const [month, monthData] of Object.entries(nextData.miesiace ?? {})) {
    for (const invoice of monthData?.faktury ?? []) {
      const invoiceNumber = String(invoice.pdfImport?.numerFaktury ?? "");
      const parsedRows = parsedByInvoiceNumber.get(invoiceNumber);
      if (!parsedRows) continue;

      const sourceRows = invoice.pdfImport?.sourceRows ?? [];
      if (sourceRows.length !== parsedRows.length) {
        throw new Error(
          `Faktura ${invoiceNumber}: zapisano ${sourceRows.length} wierszy, PDF ma ${parsedRows.length}. Przerwano bez zapisu.`
        );
      }
      const parsedRowsByOrder = new Map(
        parsedRows.map((row) => [String(row.orderNumber ?? ""), row])
      );
      const missingOrders = sourceRows.filter(
        (row) => !parsedRowsByOrder.has(String(row.orderNumber ?? ""))
      );
      if (missingOrders.length > 0) {
        throw new Error(
          `Faktura ${invoiceNumber}: ${missingOrders.length} numerów zleceń nie pasuje do PDF. Przerwano bez zapisu.`
        );
      }

      invoice.pdfImport.sourceRows = mergeDescriptions(sourceRows, parsedRowsByOrder);
      invoice.pdfImport.pozycjeUwzglednione = mergeDescriptions(
        invoice.pdfImport.pozycjeUwzglednione,
        parsedRowsByOrder
      );
      invoice.pdfImport.pozycjeOdrzucone = mergeDescriptions(
        invoice.pdfImport.pozycjeOdrzucone,
        parsedRowsByOrder
      );

      const descriptionCount = invoice.pdfImport.sourceRows.filter(
        (row) => row.additionalDescription
      ).length;
      report.push({
        workspaceId: workspace.id,
        month,
        invoiceId: invoice.id,
        invoiceNumber,
        rows: sourceRows.length,
        descriptions: descriptionCount,
      });
      matchCounts.set(invoiceNumber, (matchCounts.get(invoiceNumber) ?? 0) + 1);
      changed = true;
    }
  }

  if (changed) updates.push({ id: workspace.id, data: nextData });
}

for (const [invoiceNumber, count] of matchCounts) {
  if (count !== 1) {
    throw new Error(`Faktura ${invoiceNumber} pasuje do ${count} zapisanych faktur zamiast dokładnie jednej.`);
  }
}

if (apply) {
  for (const update of updates) {
    const { error } = await admin.from("workspaces").update({ data: update.data }).eq("id", update.id);
    if (error) throw error;
  }
}

console.log(JSON.stringify({ mode: apply ? "applied" : "dry-run", report }, null, 2));
