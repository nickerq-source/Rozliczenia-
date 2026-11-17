import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { cronAuthorized, notifyWorkspace } from "@/lib/cron";
import { DaneMiesiaca, MiesiącId, WorkspaceData } from "@/lib/types";
import { MIESIACE_ZAKRESU } from "@/lib/dates";
import { getInvoiceWeekIndex } from "@/lib/invoice-weeks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Auto-opłata faktur (Vercel Cron, codziennie rano):
 * faktura ze statusem != oplacona i datą wystawienia starszą niż 21 dni
 * → status = oplacona + audit + push.
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
  }

  try {
    const admin = getAdminSupabase();
    const { data: workspaces, error } = await admin
      .from("workspaces")
      .select("id, data, updated_at");
    if (error || !workspaces) {
      return NextResponse.json({ ok: false, error: error?.message }, { status: 500 });
    }

    const today = new Date().toISOString().slice(0, 10);
    let changed = 0;

    for (const ws of workspaces) {
      const wsData = ws.data as WorkspaceData;
      let dirty = false;
      const events: { id: string; status: string | undefined; weekNumber: number }[] = [];

      for (const m of MIESIACE_ZAKRESU) {
        const dane = wsData.miesiace?.[m as MiesiącId] as DaneMiesiaca | undefined;
        if (!dane?.faktury) continue;

        dane.faktury = dane.faktury.map((f, i) => {
          if (!f?.issueDate || f.status === "oplacona") return f;
          const weekNumber = getInvoiceWeekIndex(f, i, m as MiesiącId) + 1;

          // payment_date = issueDate + 21 dni
          const due = new Date(f.issueDate + "T12:00:00");
          due.setDate(due.getDate() + 21);
          const dueISO = due.toISOString().slice(0, 10);

          if (dueISO <= today) {
            dirty = true;
            events.push({ id: f.id, status: f.status, weekNumber });
            return { ...f, status: "oplacona" as const };
          }
          return f;
        });
      }

      if (dirty) {
        const saved = await admin
          .from("workspaces")
          .update({ data: wsData, updated_at: new Date().toISOString() })
          .eq("id", ws.id).eq("updated_at", ws.updated_at).select("id").maybeSingle();
        if (saved.error) throw new Error(saved.error.message);
        if (!saved.data) continue;
        changed += events.length;
        for (const event of events) {
          const description = `Faktura (tydzień ${event.weekNumber}) automatycznie oznaczona jako opłacona (21 dni)`;
          await admin.from("audit_log").insert({ workspace_id: ws.id, user_name: "system", action: "faktura_oplacona_auto", entity: "invoice", entity_id: event.id, old_value: { status: event.status }, new_value: { status: "oplacona" }, description });
          await notifyWorkspace(ws.id, "faktura_oplacona", description).catch(() => {});
        }
      }
    }

    return NextResponse.json({ ok: true, changed });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Błąd serwera" },
      { status: 503 }
    );
  }
}
