import type { PDFImportDiagnosticRow, PDFImportFilter } from "./types";
import { KIEROWCA, TYP_TRANSPORTU, VAT } from "./config";
import { checkInvoiceDocument, INVOICE_PARSER_VERSION, invoiceDate, invoiceText, parseMoneyCents, settleInvoiceRows } from "./invoice-settlement";

export interface InvoicePDFItem { text: string; x: number; y: number; width: number; height: number }
export interface InvoicePDFPage { pageNumber: number; items: InvoicePDFItem[] }

// Headers, not absolute coordinates, define the layout independently on each page.
const HEADERS = [
  ["order", "Nr zlecenia"], ["route", "Trasa"], ["driver", "Imię i nazwisko"],
  ["vehicle", "Typ środka"], ["date", "załadunku"], ["km", "Odległość"],
  ["pallets", "paletowych"], ["weight", "Waga"], ["notes", "Uwagi"],
  ["cost", "Koszt potwierdzony"], ["line", "Koszt linia"], ["distribution", "Koszt dystrybucja"],
  ["toll", "Koszt viatol"], ["other", "Koszt inne"], ["galaxy", "Koszt galaxy"],
  ["status", "Status ZT"], ["invitation", "Id zaproszenia"], ["carrier", "Kod przewoźnika"],
] as const;
const ORDER = /^\d{2,6}\/\d{2}\/\d{2}CLKR2(?:\/[DI])?$/i;
const normalized = (value: string) => invoiceText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/Ł/g, "L");

function cellText(items: InvoicePDFItem[]): string {
  const ordered = [...items].sort((a, b) => Math.abs(a.y - b.y) < Math.min(a.height, b.height) / 3 ? a.x - b.x : b.y - a.y);
  return ordered.map(item => item.text.trim()).join(" ").replace(/\s+/g, " ").trim();
}

function readPage(page: InvoicePDFPage): { rows: PDFImportDiagnosticRow[]; warnings: string[]; declared: number[] } {
  const driverHeader = page.items.find(item => normalized(item.text) === normalized("Imię i nazwisko"));
  const candidates = page.items.filter(item => ORDER.test(item.text.replace(/\s/g, ""))).sort((a, b) => b.y - a.y);
  const declared: number[] = [];
  for (const label of page.items.filter(item => normalized(item.text).startsWith("KOSZT POTWIERDZONY - SUM"))) {
    const value = page.items.filter(item => item.y < label.y && label.y - item.y < label.height * 3 && Math.abs(item.x - label.x) < label.height).sort((a, b) => b.y - a.y)[0];
    const cents = value ? parseMoneyCents(value.text) : null;
    if (cents !== null) declared.push(cents);
  }
  const scale = driverHeader?.height || candidates[0]?.height || 5;
  const headers = HEADERS.map(([key, label]) => ({ key, item: page.items.find(item => !!driverHeader &&
    Math.abs(item.y - driverHeader.y) <= scale * 2 && normalized(item.text) === normalized(label)) }));
  const missing = headers.filter(header => !header.item).map(header => header.key);
  const warnings = missing.length ? [`Strona ${page.pageNumber}: nierozpoznane nagłówki (${missing.join(", ")})`] : [];
  // Midpoints between header extents assign text by its centre, including wrapped cell lines.
  const columns = headers.flatMap(header => header.item ? [{ key: header.key, item: header.item }] : []);
  const edges = columns.slice(1).map((col, index) => (columns[index].item.x + columns[index].item.width + col.item.x) / 2);
  const starts = missing.length ? candidates : candidates.filter(item => item.x + item.width / 2 < edges[0] && item.y < driverHeader!.y - scale * 2);
  if (!starts.length && driverHeader) warnings.push(`Strona ${page.pageNumber}: tabela bez rozpoznanych numerów zleceń`);
  const tableBottom = page.items.filter(item => /^Strona\s+\d+/i.test(item.text)).reduce((max, item) => Math.max(max, item.y + scale), 0);
  const rows = starts.map((start, index): PDFImportDiagnosticRow => {
    const block = page.items.filter(item => item.y <= start.y + scale / 3 && item.y > (starts[index + 1]?.y ?? tableBottom) + (starts[index + 1] ? scale / 3 : 0));
    const grouped: Record<string, InvoicePDFItem[]> = {};
    for (const item of block) {
      const centre = item.x + item.width / 2;
      const col = columns[edges.findIndex(edge => centre < edge) < 0 ? columns.length - 1 : edges.findIndex(edge => centre < edge)];
      if (col) (grouped[col.key] ??= []).push(item);
    }
    const cells = Object.fromEntries(Object.entries(grouped).map(([key, items]) => [key, cellText(items)]));
    const order = (cells.order || start.text).replace(/\s/g, "");
    const kind = order.match(/\/([DI])$/i)?.[1].toUpperCase() as "D" | "I" | undefined;
    const cost = parseMoneyCents(cells.cost ?? "");
    const km = /^(?:\d+)(?:[.,]\d+)?$/.test(cells.km ?? "") ? Number(cells.km.replace(",", ".")) : null;
    const date = invoiceDate(cells.date);
    const problems = [...warnings];
    if (!ORDER.test(order) || !kind) problems.push("brak jednoznacznego numeru /D lub /I");
    if (!cells.driver || cells.driver.trim().split(/\s+/).length < 2) problems.push("niepełna komórka kierowcy");
    if (!/^\d+\/\d+$/.test(cells.vehicle ?? "")) problems.push("niepoprawny typ transportu");
    if (!date) problems.push("brak daty załadunku");
    if (cost === null) problems.push("brak jednoznacznej kwoty w kolumnie Koszt potwierdzony");
    if (km === null) problems.push("brak jednoznacznej odległości");
    return { orderNumber: order, orderKind: kind ?? null, date, driverName: cells.driver ?? "", vehicleType: cells.vehicle ?? "",
      route: cells.route ?? "", km: km ?? 0, cost: (cost ?? 0) / 100, notes: cells.notes ?? "", additionalDescription: cells.notes ?? "",
      status: cells.status ?? "", invitationId: cells.invitation || null, vehicleOwner: "unknown",
      isAdditional: kind === "I", reason: "rekord źródłowy", needsReview: problems.length > 0, parseWarnings: problems,
      source: { page: page.pageNumber, cells }, rawText: cellText(block) };
  });
  return { rows, warnings, declared };
}

export function parseInvoiceTable(pages: InvoicePDFPage[], options: Partial<PDFImportFilter> = {}, vatRate = VAT) {
  const parsed = pages.map(readPage);
  const sourceRows = parsed.flatMap(page => page.rows);
  const warnings = parsed.flatMap(page => page.warnings);
  const declarations = [...new Set(parsed.flatMap(page => page.declared))];
  if (declarations.length > 1) warnings.push("Różne sumy kontrolne na stronach PDF");
  if (!declarations.length) warnings.push("Brak sumy kontrolnej Koszt potwierdzony - SUM");
  const invoiceNumbers = [...new Set(sourceRows.flatMap(row => row.invitationId && /^58\d{8,12}$/.test(row.invitationId) ? [row.invitationId] : []))];
  if (invoiceNumbers.length > 1) warnings.push("PDF zawiera więcej niż jeden numer faktury");
  const driverName = options.driverName ?? KIEROWCA;
  const vehicleType = options.vehicleType ?? TYP_TRANSPORTU;
  const dates = sourceRows.filter(row => invoiceText(row.driverName) === invoiceText(driverName) && row.vehicleType === vehicleType).flatMap(row => row.date ? [row.date] : []).sort();
  const filters: PDFImportFilter = { driverName, vehicleType,
    dateFrom: invoiceDate(options.dateFrom) ?? dates[0] ?? null,
    dateTo: invoiceDate(options.dateTo) ?? dates.at(-1) ?? null };
  return { invoiceNumber: invoiceNumbers.length === 1 ? invoiceNumbers[0] : null,
    parserVersion: INVOICE_PARSER_VERSION, documentCheck: checkInvoiceDocument(sourceRows, declarations.length === 1 ? declarations[0] : null, warnings),
    ...settleInvoiceRows(sourceRows, filters, [], vatRate) };
}
