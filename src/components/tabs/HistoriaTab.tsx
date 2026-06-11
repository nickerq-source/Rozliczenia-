"use client";

// Zakładka Historia — pełny audit log z filtrami (tylko admin, RLS)

import { useEffect, useMemo, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { Card } from "../ui/Card";
import { IconHistory, IconLoader } from "../ui/icons";
import { POLSKIE_MIESIACE } from "@/lib/dates";

interface AuditRow {
  id: string;
  user_name: string;
  action: string;
  entity: string;
  description: string;
  created_at: string;
}

interface Props {
  token: string; // workspace id
}

function formatDataCzas(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function HistoriaTab({ token }: Props) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState(false);

  // Filtry
  const [fMiesiac, setFMiesiac] = useState<string>("");
  const [fUser, setFUser] = useState<string>("");
  const [fAction, setFAction] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const supabase = getBrowserSupabase();
        const { data, error } = await supabase
          .from("audit_log")
          .select("id, user_name, action, entity, description, created_at")
          .eq("workspace_id", token)
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        setRows(data ?? []);
      } catch {
        setError(true);
        setRows([]);
      }
    })();
  }, [token]);

  const users = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.user_name))].sort(),
    [rows]
  );
  const actions = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.action))].sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    return (rows ?? []).filter((r) => {
      if (fUser && r.user_name !== fUser) return false;
      if (fAction && r.action !== fAction) return false;
      if (fMiesiac) {
        const m = new Date(r.created_at).getMonth() + 1;
        if (String(m) !== fMiesiac) return false;
      }
      return true;
    });
  }, [rows, fUser, fAction, fMiesiac]);

  const selectCls =
    "bg-input border border-line rounded-[10px] px-2.5 py-1.5 text-xs text-ink";

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <IconHistory size={18} className="text-amber-brand" />
        <h3 className="text-sm font-bold uppercase tracking-wider text-dim flex-1">
          Historia zmian
        </h3>
      </div>

      {/* Filtry */}
      <div className="flex flex-wrap gap-2 mb-3">
        <select value={fMiesiac} onChange={(e) => setFMiesiac(e.target.value)} className={selectCls}>
          <option value="">Wszystkie miesiące</option>
          {[6, 7, 8, 9, 10, 11, 12].map((m) => (
            <option key={m} value={m}>{POLSKIE_MIESIACE[m]}</option>
          ))}
        </select>
        <select value={fUser} onChange={(e) => setFUser(e.target.value)} className={selectCls}>
          <option value="">Wszyscy użytkownicy</option>
          {users.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={fAction} onChange={(e) => setFAction(e.target.value)} className={selectCls}>
          <option value="">Wszystkie akcje</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {rows === null ? (
        <div className="flex items-center gap-2 text-dim text-sm py-6 justify-center">
          <IconLoader size={16} /> Ładowanie…
        </div>
      ) : error ? (
        <p className="text-sm text-dim/60 py-4 text-center">
          Historia niedostępna (brak połączenia z bazą).
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-dim/60 py-4 text-center">Brak wpisów.</p>
      ) : (
        <>
          {/* Okno na ~8 wpisów; dalsze widać po przewinięciu palcem (suwak) */}
          <div className="space-y-1 max-h-[27rem] overflow-y-auto overscroll-contain pr-1 historia-scroll">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-lg bg-surface2 px-3 py-2">
                <p className="text-xs text-ink leading-snug">{r.description}</p>
                <p className="text-[11px] text-dim/60 mt-0.5 tabular-nums">
                  {formatDataCzas(r.created_at)} · {r.user_name} ·{" "}
                  <span className="text-amber-brand/70">{r.action}</span>
                </p>
              </div>
            ))}
          </div>
          {filtered.length > 8 && (
            <p className="text-[11px] text-dim/50 text-center mt-2">
              {filtered.length} wpisów — przewiń, aby zobaczyć dalsze ↓
            </p>
          )}
        </>
      )}
    </Card>
  );
}
