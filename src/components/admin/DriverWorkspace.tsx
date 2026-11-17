"use client";

import { useMemo, useState } from "react";
import type { DaneMiesiaca, FuelVehicleConfig, MiesiącId, WorkspaceData, WpisTankowania } from "@/lib/types";
import { DRIVER_NAMES, DRIVER_VIEWS, type DriverId, type DriverView } from "@/lib/admin-navigation";
import { assignDriverVehicle, driverMonth, driverMonths, driverVehicleHistory, updateDriverMonth, vehicleMonths } from "@/lib/driver-costs";
import { domyslneDaneMiesiaca, formatZl, obliczWynikMiesiaca } from "@/lib/business-logic";
import { getUstawienia } from "@/lib/tax";
import type { FleetCommand } from "@/lib/fleet-commands";
import type { SaveStatus } from "@/hooks/useWorkspace";
import { KosztyTab } from "../tabs/KosztyTab";
import { PreviewDriver } from "../admin-preview/PreviewDriver";
import { Payroll } from "../admin-preview/FleetPanel";
import { RafalWorkCalendar } from "./RafalWorkCalendar";
import { PodsumowanieTab } from "../tabs/PodsumowanieTab";
import { logChange } from "@/lib/audit";
import "../admin-preview/admin-preview.css";

type Props = {
  data: WorkspaceData; month: MiesiącId; driver: DriverId; view: DriverView; onView: (view: DriverView) => void;
  token: string; userName: string; status: SaveStatus; busy: boolean;
  updateMonth: (updater: (month: DaneMiesiaca) => DaneMiesiaca) => void;
  updateWorkspace: (updater: (data: WorkspaceData) => WorkspaceData) => void;
  save: (command: FleetCommand) => Promise<boolean>;
  moveFuel: (id: string, target: MiesiącId, patch: Partial<WpisTankowania>) => boolean;
  focus?: string | null;
  onCompany: () => void;
};
export function DriverWorkspace({ data, month, driver, view, onView, token, userName, status, busy, updateMonth, updateWorkspace, save, moveFuel, focus, onCompany }: Props) {
  const all = data.miesiace[month] ?? domyslneDaneMiesiaca(month);
  const settings = getUstawienia(data);
  const vehicles = driverVehicleHistory(data, driver);
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const vehicle = vehicles.find(v => v.id === selectedVehicle) ?? vehicles[0];
  const scoped = driverMonth(all, driver, data.vehicles, vehicle?.id);
  const months = useMemo(() => view === "statystyki" && vehicle ? vehicleMonths(data, vehicle.id) : driverMonths(data, driver, vehicle?.id), [data, driver, vehicle, view]);
  const result = obliczWynikMiesiaca(month, driverMonth(all, driver, data.vehicles), settings);
  const salary = driver === "rafal" ? result.rafal.payout : result.wynagrodzenieDoWyplaty;
  const charges = driver === "rafal" ? result.rafal.charges : result.obciazeniaPracownika;
  const row = (label: string, value: number) => <div className="flex justify-between gap-4 border-b border-line py-3 text-sm"><span className="text-dim">{label}</span><strong className="shrink-0 tabular-nums">{formatZl(value)}</strong></div>;
  return <section aria-label={`Profil: ${DRIVER_NAMES[driver]}`}>
    <h1 className="mb-4 text-xl font-bold">{DRIVER_NAMES[driver]}</h1>
    <label className="mb-4 block text-xs text-dim sm:hidden">Dział kierowcy
      <select aria-label="Dział kierowcy" value={view} onChange={e => onView(e.target.value as DriverView)} className="mt-2 w-full min-h-[44px] rounded-lg border border-line bg-surface px-3 text-sm font-bold text-ink">
        {DRIVER_VIEWS.filter(([id]) => driver === "rafal" || id !== "umowa").map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
    </label>
    <nav aria-label="Działy kierowcy" className="mb-4 hidden flex-wrap gap-2 sm:flex">
      {DRIVER_VIEWS.filter(([id]) => driver === "rafal" || id !== "umowa").map(([id, label]) => <button key={id} aria-current={view === id ? "page" : undefined} onClick={() => onView(id)} className={`min-h-[40px] rounded-lg border px-3 py-2 text-xs font-bold ${view === id ? 'border-amber-brand text-amber-brand bg-amber-brand/10' : 'border-line text-dim bg-surface'}`}>{label}</button>)}
    </nav>
    <fieldset disabled={busy || !!all.zamkniety?.locked}>
    {view === "koszty" && <div className="bg-surface px-4 py-2">
      <h2 className="py-3 text-base font-bold">Koszty kierowcy</h2>
      {row("Wypłata kierowcy", salary)}{row("Podatek i składki pracownika", charges)}
      {row("Paliwo", result.paliwo)}{row("Samochód i działalność", result.inne)}{row("Leasing", result.leasing)}
      {row("Razem koszt kierowcy", salary + charges + result.paliwo + result.inne + result.leasing)}
    </div>}
    {(view === "samochod" || view === "tankowanie" || view === "statystyki") && <>
      <div className="mb-4 border-b border-line pb-4">
        <label className="block text-sm text-dim">Pojazd<select aria-label="Pojazd kierowcy" className="mt-2 w-full rounded-lg border border-line bg-input p-3 text-ink" value={vehicle?.id ?? ""} onChange={e => setSelectedVehicle(e.target.value)}>
          {!vehicles.length && <option value="">Nie przypisano pojazdu</option>}
          {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}{v.registration ? ` · ${v.registration}` : ""}</option>)}
        </select></label>
        <VehicleEditor key={driver} data={data} driver={driver} disabled={busy || !!all.zamkniety?.locked} onSave={vehicle => {
          updateWorkspace(prev => assignDriverVehicle(prev, vehicle));
          setSelectedVehicle(vehicle.id);
          logChange({ workspaceId: token, userName, action: "pojazd_przypisany", entity: "vehicle", entityId: vehicle.id, description: `${userName}: pojazd ${vehicle.name} przypisany do ${DRIVER_NAMES[driver]}`, newValue: vehicle });
        }} />
      </div>
      {view !== "samochod" && !vehicle && <p className="rounded-lg border border-amber-brand/40 bg-surface p-4 text-sm text-amber-brand">Brak przypisanego auta. Uzupełnij pojazd przed dodaniem tankowania.</p>}
    </>}
    {(view === "samochod" || (view === "tankowanie" || view === "statystyki") && vehicle || view === "wyplata" && driver === "zenia") && <KosztyTab
      key={`${driver}-${month}-${view}-${vehicle?.id}`} section={view === "wyplata" ? "wyplata" : view === "samochod" ? "samochod" : view === "statystyki" ? "statystyki" : "tankowanie"}
      miesiac={month} dane={view === "statystyki" ? months[month] ?? scoped : scoped} ustawienia={settings} token={token} userName={userName} saveStatus={status}
      wszystkieMiesiace={months} vehicles={vehicle ? [vehicle] : []} focusZgloszenieId={focus}
      onUpdate={updater => updateMonth(prev => updateDriverMonth(prev, driver, data.vehicles, updater, vehicle?.id))}
      onMoveTankowanie={moveFuel}
    />}
    {view === "wyplata" && driver === "zenia" && <div className="mt-4"><PodsumowanieTab scope="payroll" miesiac={month} dane={all} ustawienia={settings} token={token} userName={userName} isAdmin onUpdate={updateMonth} /></div>}
    {(view === "faktury" || view === "umowa" && driver === "rafal") && <div className="admin-preview driver-embedded">
      {view === "umowa" ? <Payroll month={month} dane={all} save={save} busy={busy} /> : <PreviewDriver embedded
        key={`${driver}-${month}-${view}`} driver={driver} part={view === "faktury" ? "faktury" : "dni"} onPart={() => {}}
        month={month} dane={all} available settings={settings} drafts={all.rafal?.days ?? []} onDrafts={() => {}} onCompany={onCompany}
        live={{ busy, saveDay: day => save({ kind: "day", month, day }), payroll: null }}
      />}
    </div>}
    </fieldset>
    {view === "wyplata" && driver === "rafal" && <div className="admin-preview driver-embedded"><RafalWorkCalendar key={`${token}-${month}`} month={month} dane={all} token={token} save={save} busy={busy} /></div>}
  </section>;
}

function VehicleEditor({ data, driver, disabled, onSave }: { data: WorkspaceData; driver: DriverId; disabled: boolean; onSave: (vehicle: FuelVehicleConfig) => void }) {
  const [id, setId] = useState("");
  const [error, setError] = useState("");
  const current = data.vehicles?.find(v => v.id === id);
  return <details className="mt-3 text-sm"><summary className="cursor-pointer py-2 text-amber-brand">Dane i przypisanie pojazdu</summary>
    <form key={id} className="space-y-3 pt-3" onSubmit={e => {
      e.preventDefault(); setError("");
      const form = new FormData(e.currentTarget);
      const name = String(form.get("name") ?? "").trim();
      const capacity = Number(form.get("capacity"));
      if (!name) { setError("Podaj nazwę pojazdu."); return; }
      if (!Number.isFinite(capacity) || capacity <= 0 || capacity > 3000) { setError("Podaj pojemność baku od 1 do 3000 l."); return; }
      if (current && (current.driverId ?? "zenia") !== driver && !window.confirm(`Przypisać pojazd ${current.name} do ${DRIVER_NAMES[driver]}? Dotychczasowe koszty zachowają właściciela.`)) return;
      onSave({ id: current?.id ?? crypto.randomUUID(), name, registration: String(form.get("registration")).trim(), tankCapacityLiters: capacity, driverId: driver, active: true });
    }}>
      <fieldset disabled={disabled} className="grid gap-3">
        <label>Pojazd do zmiany<select aria-label="Pojazd do zmiany" className="mt-1 w-full rounded-lg border border-line bg-input p-2" value={id} onChange={e => setId(e.target.value)}><option value="">Nowy pojazd</option>{data.vehicles?.map(v => <option key={v.id} value={v.id}>{v.name} {v.registration}</option>)}</select></label>
        <label>Nazwa pojazdu<input name="name" required maxLength={80} defaultValue={current?.name ?? ""} className="mt-1 w-full rounded-lg border border-line bg-input p-2" /></label>
        <label>Rejestracja<input name="registration" maxLength={20} defaultValue={current?.registration ?? ""} className="mt-1 w-full rounded-lg border border-line bg-input p-2" /></label>
        <label>Pojemność baku (l)<input name="capacity" type="number" required min="1" max="3000" step="1" defaultValue={current?.tankCapacityLiters ?? ""} className="mt-1 w-full rounded-lg border border-line bg-input p-2" /></label>
        <button className="min-h-[44px] rounded-lg bg-amber-brand p-2 font-bold text-amber-ink">Zapisz pojazd</button>
      </fieldset>{error && <p role="alert" className="text-red-300">{error}</p>}
    </form>
  </details>;
}
