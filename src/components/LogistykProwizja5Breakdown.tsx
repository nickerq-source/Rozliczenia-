import { formatZl } from "@/lib/business-logic";
import type { RozliczenieLogistyka } from "@/lib/logistyk";

export function LogistykProwizja5Breakdown({
  rozliczenie,
}: {
  rozliczenie: RozliczenieLogistyka;
}) {
  const stawkaNaCzysto = rozliczenie.ustawienia.prowizjaNaCzystoProcent;
  const stawkaZlecen = rozliczenie.ustawienia.prowizjaZlecenProcent;

  return (
    <div className="my-2 border-y border-line/60 py-2.5">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-amber-brand">
        {rozliczenie.ustawienia.liczProwizjeNaCzysto
          ? `Jak liczymy prowizję ${stawkaNaCzysto}%`
          : "Prowizja od kwoty na czysto jest wyłączona"}
      </p>
      <div className="space-y-1.5 text-xs">
        <BreakdownRow
          label="Na czysto po wszystkich kosztach i podatkach"
          value={rozliczenie.naCzysto}
        />
        <BreakdownRow
          label={rozliczenie.ustawienia.liczProwizjeZlecen
            ? `Minus zlecenia Żeni objęte już prowizją ${stawkaZlecen}%`
            : "Prowizja od zleceń wyłączona — bez pomniejszenia"}
          value={rozliczenie.zleceniaZeniOdjeteOdPodstawy}
          prefix="−"
        />
        <BreakdownRow label={`Podstawa prowizji ${stawkaNaCzysto}%`} value={rozliczenie.podstawa5} strong />
        <BreakdownRow label={`${stawkaNaCzysto}% dla logistyka`} value={rozliczenie.prowizja5} accent strong />
      </div>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  prefix,
  strong = false,
  accent = false,
}: {
  label: string;
  value: number;
  prefix?: string;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 ${strong ? "font-bold" : ""}`}>
      <span className={strong ? "text-ink" : "text-dim"}>{label}</span>
      <span className={`tabular-nums ${accent ? "text-amber-brand" : "text-white"}`}>
        {prefix ? `${prefix} ` : ""}{formatZl(value)}
      </span>
    </div>
  );
}
