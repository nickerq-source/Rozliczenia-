"use client";

import { DRIVER_NAMES, switchAdminDriver, type AdminLocation, type DriverId } from "@/lib/admin-navigation";
import type { ReactNode } from "react";
import { TabSwitch } from "../TabSwitch";
import { IconCalendar, IconChartBar, IconUsers, IconChevronDown, IconCheck } from "../ui/icons";
import { POLSKIE_MIESIACE, ROK } from "@/lib/dates";
import "./driver-console.css";
import { DriverAvatar } from "./DriverAvatar";
import { PapiTransWordmark } from "./PapiTransWordmark";

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
  </>;
}

export function CompanyFrame({ location, onChange, children, enabled }: Props & { children: ReactNode; enabled: boolean }) {
  if (!enabled) return <>{children}</>;
  return <section aria-label="Panel firmy">
    <div className="fc-title"><h1>Menu główne</h1><DriverPeriod month={location.month} /></div>
    <div className="fc-company-layout">
      <TabSwitch showHistoria tiles active={location.tab} onChange={tab => onChange({ ...location, tab })} />
      <div className="min-w-0 space-y-4">{children}</div>
    </div>
  </section>;
}

export function AdminChoices({ location, onChange }: Props) {
  const root = location.area === "start";
  return <section className="py-4" aria-label={root ? "Wybierz dział" : "Wybierz kierowcę"}>
    {root ? <div className="fc-title"><h1><PapiTransWordmark /></h1><DriverPeriod month={location.month} /></div> : <div className="fc-title">
      <h1 className="fc-directory-title">Kierowcy <span className="fc-count">{Object.keys(DRIVER_NAMES).length}</span></h1>
      <DriverPeriod month={location.month} />
    </div>}
    <div className={`grid gap-3 ${root ? 'sm:grid-cols-2' : 'grid-cols-2'}`}>
      {root ? <>
        {([["firma", "Menu główne", IconChartBar], ["kierowcy", "Kierowcy", IconUsers]] as const).map(([area, label, Icon]) =>
          <button key={area} type="button" data-area={area} className="fc-sign fc-entry" onClick={() => onChange({ ...location, area, driver: undefined, ...(area === "firma" ? { tab: "podsumowanie" as const } : {}) })}>
            <span className="fc-entry-icon"><Icon size={25} aria-hidden="true" /></span><strong>{label}</strong><IconChevronDown size={18} className="-rotate-90" aria-hidden="true" />
          </button>)}
      </> : (Object.entries(DRIVER_NAMES) as ["zenia" | "rafal", string][]).map(([driver, name]) =>
        <button key={driver} type="button" className="fc-sign fc-person" data-driver={driver} aria-label={name} onClick={() => onChange({ ...location, driver, view: "koszty" })}>
          <span aria-hidden="true" className="fc-wanted">WANTED</span>
          <DriverAvatar driver={driver} />
          <strong>{name}</strong>
          <span className="fc-person-action">Otwórz profil <IconChevronDown size={16} className="-rotate-90" aria-hidden="true" /></span>
        </button>)}
    </div>
  </section>;
}

export function DriverPeriod({ month }: { month: AdminLocation["month"] }) {
  return <time className="fc-period" dateTime={`${ROK}-${String(month).padStart(2, "0")}`}><IconCalendar size={15} aria-hidden="true" />{POLSKIE_MIESIACE[month]} {ROK}</time>;
}

export function DriverSwitcher({ location, onChange }: Props) {
  return <nav aria-label="Przełącz kierowcę" className="self-start lg:sticky lg:top-[148px]">
    <h2 className="mb-2 text-xs font-bold uppercase text-dim">Kierowcy</h2>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
      {(Object.entries(DRIVER_NAMES) as [DriverId, string][]).map(([driver, name]) => <button
        key={driver} type="button" aria-current={location.driver === driver ? "page" : undefined}
        onClick={() => { if (location.driver !== driver) onChange(switchAdminDriver(location, driver)); }}
        className="fc-sign fc-switch" data-driver={driver}
      ><DriverAvatar driver={driver} /><span>{name}</span>{location.driver === driver && <IconCheck size={14} aria-hidden="true" />}</button>)}
    </div>
  </nav>;
}
