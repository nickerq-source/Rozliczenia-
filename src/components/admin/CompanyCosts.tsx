"use client";
import { useState, type ComponentProps } from "react";
import { KosztyTab } from "../tabs/KosztyTab";
import { formatZl, obliczWynikMiesiaca } from "@/lib/business-logic";
import { driverMonth } from "@/lib/driver-costs";
import { DRIVER_NAMES } from "@/lib/admin-navigation";

export function CompanyCosts(props: ComponentProps<typeof KosztyTab>) {
  const [split, setSplit] = useState(false);
  const total = obliczWynikMiesiaca(props.miesiac, props.dane, props.ustawienia);
  return <>
    <section className="bg-surface px-4 py-2" aria-label="Zbiorcze koszty firmy">
      <h1 className="py-3 text-xl font-bold">Koszty firmy</h1>
      {(["zenia", "rafal"] as const).map(driver => {
        const result = obliczWynikMiesiaca(props.miesiac, driverMonth(props.dane, driver, props.vehicles), props.ustawienia);
        const payroll = driver === "rafal" ? result.rafal.total : result.wynagrodzenieDoWyplaty + result.obciazeniaPracownika;
        return <div key={driver} className="border-b border-line py-3 text-sm">
          <div className="flex justify-between gap-4"><span>{DRIVER_NAMES[driver]}</span><strong className="shrink-0 tabular-nums">{formatZl(payroll + result.paliwo + result.inne + result.leasing)}</strong></div>
          <dl className="mt-2 space-y-1 text-xs text-dim">{[["Wypłata i składki", payroll], ["Paliwo", result.paliwo], ["Samochód i działalność", result.inne], ["Leasing", result.leasing]].map(([label, value]) => <div key={label} className="flex justify-between gap-4"><dt>{label}</dt><dd className="tabular-nums">{formatZl(Number(value))}</dd></div>)}</dl>
        </div>;
      })}
      <div className="flex justify-between gap-4 py-4 font-bold"><span>Razem koszty firmy</span><span className="tabular-nums text-amber-brand">{formatZl(total.kosztyOperacyjne)}</span></div>
    </section>
    <button aria-expanded={split} className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-left text-sm font-bold" onClick={() => setSplit(!split)}>Rozliczenie wspólników 50/50</button>
    {split && <KosztyTab {...props} section="rozliczenie" />}
  </>;
}
