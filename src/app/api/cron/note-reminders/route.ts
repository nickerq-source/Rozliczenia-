import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { cronAuthorized, notifyWorkspace } from "@/lib/cron";
import { Notatka, WorkspaceData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Przypomnienia o terminach notatek (Vercel Cron, 2× dziennie):
 *  - rano (cron 6:00 UTC = 8:00 PL): „Dziś termin: …" dla dataWydarzenia = dziś
 *  - wieczorem (cron 21:00 UTC = 23:00 PL): „Jutro termin: …" dla jutra
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
  }

  try {
    const now = new Date();
    const evening = now.getUTCHours() >= 18;
    const target = new Date(now);
    if (evening) target.setUTCDate(target.getUTCDate() + 1);
    const targetISO = target.toISOString().slice(0, 10);

    const { data: workspaces, error } = await getAdminSupabase()
      .from("workspaces")
      .select("id, data");
    if (error || !workspaces) {
      return NextResponse.json({ ok: false, error: error?.message }, { status: 500 });
    }

    let sent = 0;
    for (const ws of workspaces) {
      const notatki: Notatka[] = (ws.data as WorkspaceData)?.notatki ?? [];
      for (const n of notatki.filter((x) => x.dataWydarzenia === targetISO)) {
        const description = evening
          ? `Jutro termin: ${n.tresc.slice(0, 80)} — ${n.dataWydarzenia}`
          : `Dziś termin: ${n.tresc.slice(0, 80)}`;
        sent += await notifyWorkspace(ws.id, "przypomnienie", description);
      }
    }

    return NextResponse.json({ ok: true, sent, mode: evening ? "jutro" : "dzis" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Błąd serwera" },
      { status: 503 }
    );
  }
}
