import { NextRequest, NextResponse } from "next/server";
import { extractInvoicePages } from "@/lib/invoice-pdf";
import { parseInvoiceTable } from "@/lib/invoice-table";
import { invoiceDate } from "@/lib/invoice-settlement";
import { KIEROWCA, TYP_TRANSPORTU, VAT } from "@/lib/config";
import { getSessionProfile } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Brak dostępu" }, { status: 403 });
  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Nieprawidłowe żądanie (brak form-data)" }, { status: 400 }); }
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Brak pliku PDF" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "Plik musi być w formacie PDF" }, { status: 400 });
  const driverName = String(formData.get("driverName") ?? KIEROWCA).trim() || KIEROWCA;
  const vehicleType = String(formData.get("vehicleType") ?? TYP_TRANSPORTU).trim() || TYP_TRANSPORTU;
  const dateFrom = String(formData.get("dateFrom") ?? "").trim();
  const dateTo = String(formData.get("dateTo") ?? "").trim();
  if ((dateFrom && !invoiceDate(dateFrom)) || (dateTo && !invoiceDate(dateTo)) || (dateFrom && dateTo && dateFrom > dateTo)) {
    return NextResponse.json({ error: "Nieprawidłowy zakres dat" }, { status: 400 });
  }
  try {
    const pages = await extractInvoicePages(new Uint8Array(await file.arrayBuffer()));
    const { invoiceNumber, ...filtered } = parseInvoiceTable(pages, { driverName, vehicleType, dateFrom, dateTo }, VAT);
    if (process.env.NODE_ENV === "development") {
      console.table([
        ...filtered.includedRows.map(row => ({ ...row, decision: "uwzględniona" })),
        ...filtered.rejectedRows.map(row => ({ ...row, decision: "odrzucona" })),
        ...filtered.reviewRows.map(row => ({ ...row, decision: "do sprawdzenia" })),
      ].map(row => ({ order: row.orderNumber, driver: row.driverName, type: row.vehicleType, date: row.date,
        cost: row.cost, kind: row.orderKind, decision: row.decision, reason: row.reason })));
      console.info("[import-invoice] kontrola", { invoiceNumber, routes: filtered.ileKolek, orders: filtered.ileZlecen,
        routesNet: filtered.kolkaNetto, ordersNet: filtered.zleceniaNetto, net: filtered.netto, gross: filtered.brutto,
        included: filtered.includedRows.length, rejected: filtered.rejectedRows.length, review: filtered.reviewRows.length,
        document: filtered.documentCheck });
    }
    return NextResponse.json({ invoiceNumber, filtered: filtered.sourceRows.length ? filtered : null,
      message: !filtered.sourceRows.length ? "Nie udało się odczytać pozycji tabeli. Nie zapisano żadnych kwot."
        : !filtered.includedRows.length ? "Brak pozycji dla wybranego kierowcy, typu i zakresu. Sprawdź listę odrzuconych i niepewnych pozycji." : undefined });
  } catch (err) {
    console.error("[import-invoice] odczyt PDF", err instanceof Error ? err.message : "nieznany błąd");
    return NextResponse.json({ error: "Nie udało się odczytać tabeli PDF. Sprawdź, czy dokument nie jest zaszyfrowany lub uszkodzony." }, { status: 422 });
  }
}
