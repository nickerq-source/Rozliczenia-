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
      .select("id, data");
    if (error || !workspaces) {
      return NextResponse.json({ ok: false, error: error?.message }, { status: 500 });
    }

    const today = new Date().toISOString().slice(0, 10);
    let changed = 0;

    for (const ws of workspaces) {
      const wsData = ws.data as WorkspaceData;
      let dirty = false;

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
            changed++;
            notifyWorkspace(
              ws.id,
              "faktura_oplacona",
              `Faktura (tydzień ${weekNumber}) automatycznie oznaczona jako opłacona (21 dni)`
            ).catch(() => {});
            admin.from("audit_log").insert({
              workspace_id: ws.id,
              user_name: "system",
              action: "faktura_oplacona_auto",
              entity: "invoice",
              entity_id: f.id,
              old_value: { status: f.status },
              new_value: { status: "oplacona" },
              description: `Faktura (tydzień ${weekNumber}) automatycznie oznaczona jako opłacona (21 dni)`,
            }).then(() => {});
            return { ...f, status: "oplacona" as const };
          }
          return f;
        });
      }

      if (dirty) {
        await admin
          .from("workspaces")
          .update({ data: wsData, updated_at: new Date().toISOString() })
          .eq("id", ws.id);
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
