"use client";

import { useEffect, useState } from "react";
import type { DriverId } from "@/lib/admin-navigation";
import type { MiesiącId, WorkspaceData } from "@/lib/types";
import { ROK } from "@/lib/dates";
import { getBrowserSupabase } from "@/lib/supabase-browser";

type AuditLine = { id: string; description: string; user_name: string; created_at: string };

function ZeniaHistory({ token, month }: { token: string; month: MiesiącId }) {
  const [rows, setRows] = useState<AuditLine[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const prefix = `${ROK}-${String(month).padStart(2, "0")}-`;
    // Legacy day events use the work date as entity_id, not the audit timestamp.
    void (async () => {
      try {
        const { data, error } = await getBrowserSupabase().from("audit_log")
          .select("id, description, user_name, created_at").eq("workspace_id", token)
          .or(`and(entity.in.(driver_day,payroll_day),entity_id.like.${prefix}*),and(entity.eq.payroll,entity_id.eq.${month})`)
          .order("created_at", { ascending: false }).limit(50).abortSignal(controller.signal);
        if (error) throw error;
        if (!controller.signal.aborted) setRows(data ?? []);
      } catch { if (!controller.signal.aborted) setFailed(true); }
    })();
    return () => controller.abort();
  }, [token, month]);
  if (failed) return <p role="alert">Nie udało się pobrać historii.</p>;
  if (!rows || !rows.length) return <p>{rows ? "Brak zmian dni i wypłaty w tym miesiącu." : "Wczytywanie historii…"}</p>;
  return <ul>{rows.map(row => <li key={row.id}>{row.description}<small>{row.user_name} · {new Date(row.created_at).toLocaleString("pl-PL")}</small></li>)}</ul>;
}

export function DriverHistory({ driver, month, token, history, disabled, onUndo }: {
  driver: DriverId; month: MiesiącId; token: string; history: WorkspaceData["fleetHistory"];
  disabled: boolean; onUndo: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const latest = history?.findLast(entry => !entry.undoneAt)?.id;
  const entries = history?.filter(entry => entry.month === month).reverse() ?? [];
  return <details className="fc-disclosure fc-history" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>Historia zmian</summary>
    {open && (driver === "zenia" ? <ZeniaHistory token={token} month={month} /> : !entries.length ? <p>Brak zmian w tym miesiącu.</p> :
      <ul>{entries.map(entry => <li key={entry.id}><p>{entry.description}{entry.undoneAt ? " · cofnięto" : ""}</p>
        <small>{entry.actor} · {new Date(entry.at).toLocaleString("pl-PL")}</small>
        {entry.id === latest && <button type="button" disabled={disabled} onClick={() => { if (window.confirm(`Cofnąć: ${entry.description}?`)) onUndo(entry.id); }}>Cofnij zmianę</button>}
      </li>)}</ul>)}
  </details>;
}
