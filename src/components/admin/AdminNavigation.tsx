"use client";

import { DRIVER_NAMES, switchAdminDriver, type AdminLocation, type DriverId } from "@/lib/admin-navigation";
import { TabSwitch } from "../TabSwitch";
import { IconChartBar, IconUsers, IconChevronDown } from "../ui/icons";

type Props = { location: AdminLocation; onChange: (location: AdminLocation) => void };
export function AdminNavigation({ location, onChange }: Props) {
  if (location.area === "start") return null;
  return <>
    <nav aria-label="Menu aplikacji" className="flex items-center gap-2 pb-2">
      <button title="Ekran startowy" aria-label="Ekran startowy" className="p-2 text-dim" onClick={() => onChange({ ...location, area: "start", driver: undefined })}><IconChevronDown size={16} className="rotate-90" /></button>
      {([['firma', 'Menu główne'], ['kierowcy', 'Kierowcy']] as const).map(([area, label]) => <button key={area}
        aria-current={location.area === area ? "page" : undefined}
        onClick={() => onChange({ ...location, area, driver: undefined })}
        className={`flex-1 min-h-[44px] rounded-lg border px-2 text-sm font-bold ${location.area === area ? 'border-amber-brand text-amber-brand bg-amber-brand/10' : 'border-line text-dim'}`}>{label}</button>)}
    </nav>
    {location.area === "firma" && <TabSwitch showHistoria active={location.tab} onChange={tab => onChange({ ...location, tab })} />}
  </>;
}

export function AdminChoices({ location, onChange }: Props) {
  const root = location.area === "start";
  return <section className="py-4" aria-label={root ? "Wybierz dział" : "Wybierz kierowcę"}>
    <h1 className="mb-5 text-xl font-bold">{root ? "PapiTrans" : "Kierowcy"}</h1>
    <div className="grid gap-4 sm:grid-cols-2">
      {root ? <>
        <button className="flex min-h-[132px] items-center gap-4 rounded-lg border border-amber-brand/60 bg-surface px-5 py-6 text-left text-xl font-bold" onClick={() => onChange({ ...location, area: "firma", tab: "podsumowanie" })}><IconChartBar size={30} className="shrink-0 text-amber-brand" />Menu główne</button>
        <button className="flex min-h-[132px] items-center gap-4 rounded-lg border border-green-500/50 bg-surface px-5 py-6 text-left text-xl font-bold" onClick={() => onChange({ ...location, area: "kierowcy", driver: undefined })}><IconUsers size={30} className="shrink-0 text-green-300" />Kierowcy</button>
      </> : (Object.entries(DRIVER_NAMES) as ["zenia" | "rafal", string][]).map(([driver, name]) =>
        <button key={driver} className="flex min-h-[112px] items-center gap-3 rounded-lg border border-line bg-surface px-4 py-6 text-left text-lg font-bold" onClick={() => onChange({ ...location, driver, view: "koszty" })}><IconUsers size={24} className="shrink-0 text-amber-brand" /><span>{name}</span></button>)}
    </div>
  </section>;
}

export function DriverSwitcher({ location, onChange }: Props) {
  return <nav aria-label="Przełącz kierowcę" className="self-start lg:sticky lg:top-[148px]">
    <h2 className="mb-2 text-xs font-bold uppercase text-dim">Kierowcy</h2>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
      {(Object.entries(DRIVER_NAMES) as [DriverId, string][]).map(([driver, name]) => <button
        key={driver} type="button" aria-current={location.driver === driver ? "page" : undefined}
        onClick={() => { if (location.driver !== driver) onChange(switchAdminDriver(location, driver)); }}
        className={`flex min-h-[64px] items-center gap-2 rounded-lg border px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-brand ${location.driver === driver ? 'border-amber-brand bg-surface text-amber-brand' : 'border-line bg-surface text-dim hover:border-dim hover:text-ink'}`}
      ><IconUsers size={18} className="shrink-0" /><span className="text-sm font-bold leading-5">{name}</span></button>)}
    </div>
  </nav>;
}
