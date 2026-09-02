import { formatZl } from "@/lib/business-logic";
import type { ZlecenieLog } from "@/lib/types";
import { IconChevronDown } from "./ui/icons";

const ddmm = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : iso;

function isDateOnlyNote(value: string | undefined): boolean {
  return /^\d{1,2}[./-]\d{1,2}[.,]?(?:\s*[-–—,])?$/.test(String(value ?? "").trim());
}

export function LogistykPdfOrderRow({ order }: { order: ZlecenieLog }) {
  const fullDescription = order.sourceDescription?.trim();
  const sourceNotes = order.sourceNotes?.trim();
  const showSourceNotes = sourceNotes
    && !isDateOnlyNote(sourceNotes)
    && sourceNotes !== fullDescription;

  return (
    <details className="group border-b border-line/50 last:border-b-0">
      <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <p className="text-sm text-ink">
            <span className="tabular-nums">{ddmm(order.data)}</span> · {order.kierowca}{" "}
            <span className="text-dim">({order.plate})</span>
          </p>
          <p className="truncate text-[11px] text-dim">{order.opis}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-right">
          <div>
            <span className="block tabular-nums text-sm font-bold text-white">
              {formatZl(order.wartoscNetto)}
            </span>
            <span className="text-[10px] font-bold uppercase text-green-400">PDF</span>
          </div>
          <IconChevronDown
            size={15}
            className="text-dim transition-transform group-open:rotate-180"
          />
        </div>
      </summary>

      <div className="mb-2 rounded-lg border border-line bg-surface2/60 px-3 py-2 text-[11px]">
        <p className="font-bold uppercase tracking-wide text-dim">Pełny opis</p>
        {fullDescription ? (
          <p className="mt-1 whitespace-pre-wrap break-words text-ink">{fullDescription}</p>
        ) : (
          <p className="mt-1 text-amber-brand">
            Pełny opis pojawi się po ponownym wgraniu tej faktury PDF.
          </p>
        )}
        {showSourceNotes ? (
          <p className="mt-2 break-words text-dim">
            <span className="font-semibold text-ink">Uwagi:</span> {sourceNotes}
          </p>
        ) : null}
        {order.sourceOrderNumber ? (
          <p className="mt-2 break-all text-dim">
            <span className="font-semibold text-ink">Nr zlecenia:</span>{" "}
            {order.sourceOrderNumber}
          </p>
        ) : null}
        {order.sourceFileName ? (
          <p className="mt-1 break-all text-dim">
            <span className="font-semibold text-ink">Faktura:</span> {order.sourceFileName}
          </p>
        ) : null}
      </div>
    </details>
  );
}
