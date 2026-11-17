"use client";

import { formatZl } from "@/lib/business-logic";
import { POLSKIE_MIESIACE } from "@/lib/dates";
import { companySettlementTotals } from "@/lib/company-settlement";
import type { PodatkiMiesiaca } from "@/lib/tax";
import type { WynikMiesiaca } from "@/lib/types";

function SummaryRow({ label, value, note, strong }: { label: string; value: number; note?: string; strong?: boolean }) {
  return <div className={`flex justify-between gap-3 border-b border-line py-2.5 text-sm ${strong ? "font-bold" : ""}`}>
    <dt className="min-w-0"><span>{label}</span>{note && <span className="mt-1 block text-xs font-normal text-dim">{note}</span>}</dt>
    <dd className="shrink-0 text-right tabular-nums">{formatZl(value)}</dd>
  </div>;
}

export function CompanyTaxSummary({ tax, result }: { tax: PodatkiMiesiaca; result: WynikMiesiaca }) {
  const totals = companySettlementTotals(tax, result);
  return <section aria-label={`Rozliczenie firmy: ${POLSKIE_MIESIACE[tax.miesiac]} 2026`} className="bg-surface px-4 py-4" data-testid="company-tax-summary">
    <h2 className="text-lg font-bold">{POLSKIE_MIESIACE[tax.miesiac]} 2026 · cała firma</h2>
    <p className="mt-1 text-xs text-dim">Yevhenii Pitianin + Rafał Gustab</p>
    <dl className="mt-3">
      <SummaryRow label="Przychód brutto" value={totals.revenueGross} />
      <SummaryRow label="− Wypłaty kierowców razem" value={totals.driverPayouts} note={`Żenia ${formatZl(result.wynagrodzenieDoWyplaty)} + Rafał ${formatZl(tax.rafal.payout)}`} />
      <SummaryRow label="− Paliwo obu aut" value={result.paliwo} />
      <SummaryRow label="− Pozostałe koszty" value={result.inne} />
      <SummaryRow label="− Leasing razem" value={result.leasing} />
      <SummaryRow label="− Podatki i składki razem" value={totals.taxLiabilities} note="VAT, dochodowy, rezerwa na zdrowotną właściciela i zobowiązania obu kierowców" />
      <div className={`mt-3 border-l-4 px-3 py-2 ${totals.finalCash >= 0 ? "border-green-400 text-green-300" : "border-red-400 text-red-300"}`}>
        <dt className="text-xs font-bold uppercase">Zostaje po wszystkich kosztach i podatkach</dt>
        <dd className="mt-2 text-2xl font-bold tabular-nums break-words">{formatZl(totals.finalCash)}</dd>
      </div>
    </dl>
    <details className="mt-4 border-t border-line">
      <summary className="cursor-pointer py-3 text-sm font-bold">Składniki kosztów i podatków</summary>
      <dl>
        <SummaryRow label="Wypłaty obu kierowców" value={totals.driverPayouts} />
        <SummaryRow label="Podatek i składki Żeni" value={tax.obciazeniaPracownika} />
        <SummaryRow label="Podatek i składki Rafała" value={tax.rafal.charges} />
        <SummaryRow label="Łączny koszt zatrudnienia" value={totals.employmentCosts} strong />
        <SummaryRow label="Zakupy i leasing razem" value={totals.purchaseCosts} />
        <SummaryRow label="Łączne koszty operacyjne" value={result.kosztyOperacyjne} strong />
        <SummaryRow label="Koszty obu umów uznane do podatku" value={totals.taxableEmploymentCosts} />
        <SummaryRow label="Wszystkie koszty uznane do podatku" value={tax.kosztyPodatkowe} strong />
        <SummaryRow label="Dochód podatkowy firmy" value={tax.dochod} />
        <SummaryRow label="VAT do zapłaty" value={Math.max(0, tax.vatDoZaplaty)} />
        <SummaryRow label="Podatek dochodowy firmy" value={tax.pitMiesiac} />
        <SummaryRow label="Rezerwa na zdrowotną właściciela" value={tax.zdrowotna} />
        <SummaryRow label="Zobowiązania obu kierowców" value={totals.employeeCharges} />
        <SummaryRow label="Razem podatki i składki" value={totals.taxLiabilities} strong />
      </dl>
    </details>
    {tax.rafal.incomplete && <p className="mt-3 text-sm text-amber-brand">Rafał: niepełne dane dni lub rozliczenia.</p>}
    <p className="mt-3 text-xs text-dim">Wyliczenia szacunkowe. Koszt podatkowy wynagrodzeń pozostaje zgodny z rozliczeniem umów.</p>
  </section>;
}
