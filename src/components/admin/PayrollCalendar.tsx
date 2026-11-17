import type { ReactNode } from "react";
import type { DriverId } from "@/lib/admin-navigation";
import type { MiesiącId } from "@/lib/types";
import { getDniMiesiaca, getDayOfWeek, nazwaSkrotDnia, POLSKIE_MIESIACE, ROK } from "@/lib/dates";
import { formatZl } from "@/lib/business-logic";
import "../admin-preview/admin-preview.css";

type DayCells = {
  status: ReactNode; courses: ReactNode; amount: number | null;
  active?: boolean; marked?: boolean; missingAmount?: boolean;
  amountAction?: ReactNode; extra?: ReactNode;
};

export function PayrollCalendar({ driver, month, legend, rates, action, notice, disabled, dayCells }: {
  driver: DriverId; month: MiesiącId; legend: readonly (readonly [string, string, string])[];
  rates: ReactNode; action?: ReactNode; notice?: ReactNode; disabled?: boolean;
  dayCells: (date: string) => DayCells;
}) {
  const dates = getDniMiesiaca(month);
  const offset = (getDayOfWeek(dates[0]) + 6) % 7;
  return <div className="admin-preview driver-embedded rf-calendar">
    <div className="rf-heading"><div><h2>Wypłata kierowcy</h2><p>{POLSKIE_MIESIACE[month]} {ROK}</p></div>{action}</div>
    <p className="rf-rates">{rates}</p>
    <div className="rf-legend">{legend.map(([id, short, label]) => <span key={id}><b data-status={id}>{short}</b> {label}</span>)}</div>
    {notice}
    <fieldset disabled={disabled}>
      <div role="table" aria-label="Dni pracy kierowcy">
        <div className="rf-columns" role="row">{["Dzień", "Typ dnia", "Kółka", "Dniówka"].map(label => <span key={label} role="columnheader">{label}</span>)}</div>
        {dates.map((date, i) => {
          const day = dayCells(date);
          const weekday = getDayOfWeek(date);
          return <div key={date}>
            {i > 0 && weekday === 1 && <div className="rf-week">Tydzień {Math.floor((i + offset) / 7) + 1}</div>}
            <div role="row" data-testid={`${driver}-day-${date}`} className={`rf-day ${weekday === 0 ? "rf-sunday" : weekday === 6 ? "rf-saturday" : ""} ${day.active ? "rf-active" : ""} ${day.marked ? "rf-dirty" : ""}`}>
              <div role="rowheader" className="rf-date"><strong>{Number(date.slice(8))}</strong> <span>{nazwaSkrotDnia(date)}</span></div>
              <div role="cell" className="rf-status">{day.status}</div>
              <div role="cell" className="rf-courses"><span className="rf-input-label">Kółka</span>{day.courses}</div>
              <div role="cell" className="rf-amount"><div><span className="rf-input-label">Dniówka</span><strong>{day.amount === null ? day.missingAmount ? "Brak kwoty" : "—" : formatZl(day.amount)}</strong></div>{day.amountAction}</div>
              {day.extra && <div role="cell" className="rf-extra">{day.extra}</div>}
            </div>
          </div>;
        })}
      </div>
    </fieldset>
  </div>;
}
