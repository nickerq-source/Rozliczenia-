import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { cronAuthorized } from "@/lib/cron";
import { Notatka, WorkspaceData } from "@/lib/types";
import { getWebPush } from "@/lib/webpush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface WorkspaceRow {
  id: string;
  data: WorkspaceData | null;
}

interface SubRow {
  id: string;
  user_id: string | null;
  subscription: object;
}

function warsawDateISO(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function warsawHour(date = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    hour12: false,
  }).format(date);
  return Number(hour);
}

async function notifyDrivers(workspaceId: string, description: string): Promise<number> {
  const admin = getAdminSupabase();
  const url = "/driver?tab=wiadomosci";

  await admin.from("notifications_log").insert({
    workspace_id: workspaceId,
    user_name: "system",
    action: "przypomnienie_kierowca",
    description,
    url,
    read: false,
  });

  const wp = getWebPush();
  if (!wp) return 0;

  const { data: drivers } = await admin
    .from("profiles")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("role", "driver");
  const driverIds = new Set((drivers ?? []).map((d) => d.id as string));
  if (driverIds.size === 0) return 0;

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, user_id, subscription")
    .eq("workspace_id", workspaceId);
  if (!subs?.length) return 0;

  const payload = JSON.stringify({
    title: "Przypomnienie",
    body: description,
    url,
  });
  let sent = 0;

  await Promise.all(
    (subs as SubRow[]).map(async (s) => {
      if (!s.user_id || !driverIds.has(s.user_id)) return;
      try {
        await wp.sendNotification(
          s.subscription as Parameters<typeof wp.sendNotification>[0],
          payload
        );
        sent += 1;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    })
  );

  return sent;
}

/**
 * Przypomnienia o notatkach do kierowcy. Cron ma chodzić rano; sprawdzamy datę
 * w strefie Europe/Warsaw i zapisujemy reminderSentAt w JSONB, żeby nie wysłać
 * drugi raz po redeployu albo ręcznym wywołaniu.
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
  }

  try {
    const admin = getAdminSupabase();
    const todayISO = warsawDateISO();
    const hour = warsawHour();
    const force = new URL(req.url).searchParams.get("force") === "1";
    if (!force && hour !== 9) {
      return NextResponse.json({ ok: true, skipped: true, reason: "not_9_warsaw", hour });
    }
    const now = new Date().toISOString();

    const { data: workspaces, error } = await admin
      .from("workspaces")
      .select("id, data");
    if (error || !workspaces) {
      return NextResponse.json({ ok: false, error: error?.message }, { status: 500 });
    }

    let sent = 0;
    let marked = 0;

    for (const ws of workspaces as WorkspaceRow[]) {
      const wsData = (ws.data ?? {}) as WorkspaceData;
      let changed = false;

      const notatki: Notatka[] = (wsData.notatki ?? []).map((n) => {
        const shouldSend =
          n.kanal === "kierowca" &&
          !n.odKierowcy &&
          n.dataWydarzenia === todayISO &&
          !n.reminderSentAt;

        if (!shouldSend) return n;

        const description = `Dziś: ${n.tresc.slice(0, 80)}${n.tresc.length > 80 ? "…" : ""}`;
        changed = true;
        marked += 1;
        return { ...n, reminderSentAt: now, _descriptionForSend: description } as Notatka & {
          _descriptionForSend: string;
        };
      });

      for (const n of notatki as Array<Notatka & { _descriptionForSend?: string }>) {
        if (!n._descriptionForSend) continue;
        sent += await notifyDrivers(ws.id, n._descriptionForSend);
        delete n._descriptionForSend;
      }

      if (changed) {
        const nextData: WorkspaceData = { ...wsData, notatki };
        const { error: saveErr } = await admin
          .from("workspaces")
          .update({ data: nextData, updated_at: now })
          .eq("id", ws.id);
        if (saveErr) throw new Error(saveErr.message);
      }
    }

    return NextResponse.json({ ok: true, date: todayISO, hour, reminders: marked, sent });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Błąd serwera" },
      { status: 503 }
    );
  }
}
