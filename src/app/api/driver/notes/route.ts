import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase-server";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { getWebPush } from "@/lib/webpush";
import { MIESIACE_ZAKRESU } from "@/lib/dates";
import { Notatka, WorkspaceData } from "@/lib/types";

export const runtime = "nodejs";

interface SubRow {
  id: string;
  user_name: string;
  subscription: object;
}

/** Bieżący miesiąc w dozwolonym zakresie (fallback: pierwszy) */
function biezacyMiesiac(): number {
  const m = new Date().getMonth() + 1;
  return MIESIACE_ZAKRESU.includes(m as (typeof MIESIACE_ZAKRESU)[number]) ? m : MIESIACE_ZAKRESU[0];
}

/**
 * Wątek notatek admin ↔ kierowca. Kierowca widzi i pisze TYLKO kanał
 * "kierowca" — wewnętrznych notatek adminów nie dostaje. Zapis przez service
 * role (kierowca nie ma RLS do workspaces).
 */
export async function GET() {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "driver") {
    return NextResponse.json({ error: "Tylko dla kierowcy" }, { status: 403 });
  }

  const { data: ws, error } = await getAdminSupabase()
    .from("workspaces")
    .select("data")
    .eq("id", profile.workspace_id)
    .single();
  if (error || !ws) {
    return NextResponse.json({ error: "Workspace nie znaleziony" }, { status: 404 });
  }

  const wsData = (ws.data ?? {}) as WorkspaceData;
  const notatki = (wsData.notatki ?? [])
    .filter((n) => n.kanal === "kierowca")
    .map((n) => ({
      id: n.id,
      tresc: n.tresc,
      autor: n.autor,
      odKierowcy: !!n.odKierowcy,
      dataUtworzenia: n.dataUtworzenia,
    }))
    .sort((a, b) => (a.dataUtworzenia < b.dataUtworzenia ? 1 : -1));

  return NextResponse.json({ notatki });
}

export async function POST(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "driver") {
    return NextResponse.json({ error: "Tylko dla kierowcy" }, { status: 403 });
  }

  let body: { tresc?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy JSON" }, { status: 400 });
  }
  const tresc = (body.tresc ?? "").trim();
  if (!tresc) return NextResponse.json({ error: "Pusta wiadomość" }, { status: 400 });

  const admin = getAdminSupabase();
  const { data: ws, error } = await admin
    .from("workspaces")
    .select("data")
    .eq("id", profile.workspace_id)
    .single();
  if (error || !ws) {
    return NextResponse.json({ error: "Workspace nie znaleziony" }, { status: 404 });
  }

  const wsData = (ws.data ?? {}) as WorkspaceData;
  const nowa: Notatka = {
    id: crypto.randomUUID(),
    tresc: tresc.slice(0, 2000),
    dataUtworzenia: new Date().toISOString(),
    autor: profile.name,
    miesiac: biezacyMiesiac(),
    kanal: "kierowca",
    odKierowcy: true,
  };
  const nowaData: WorkspaceData = { ...wsData, notatki: [nowa, ...(wsData.notatki ?? [])] };

  const { error: saveErr } = await admin
    .from("workspaces")
    .update({ data: nowaData, updated_at: new Date().toISOString() })
    .eq("id", profile.workspace_id);
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 503 });

  // Powiadom adminów (action notatka_od_kierowcy) + push (z pominięciem autora)
  const opis = `${profile.name} napisał: ${tresc.slice(0, 60)}${tresc.length > 60 ? "…" : ""}`;
  const url = `/admin?zakladka=wiadomosci`;
  try {
    await admin.from("audit_log").insert({
      workspace_id: profile.workspace_id,
      user_id: profile.id,
      user_name: profile.name,
      action: "notatka_od_kierowcy",
      entity: "note",
      entity_id: nowa.id,
      description: opis,
    });
    await admin.from("notifications_log").insert({
      workspace_id: profile.workspace_id,
      user_name: profile.name,
      action: "notatka_od_kierowcy",
      description: opis,
      url,
      read: false,
    });
    const wp = getWebPush();
    if (wp) {
      const { data: subs } = await admin
        .from("push_subscriptions")
        .select("id, user_name, subscription")
        .eq("workspace_id", profile.workspace_id);
      if (subs?.length) {
        const payload = JSON.stringify({ title: "PapiTrans — wiadomość", body: opis, url });
        await Promise.all(
          (subs as SubRow[]).map(async (s) => {
            if (s.user_name === profile.name) return;
            try {
              await wp.sendNotification(s.subscription as Parameters<typeof wp.sendNotification>[0], payload);
            } catch (e: unknown) {
              const status = (e as { statusCode?: number })?.statusCode;
              if (status === 404 || status === 410) {
                await admin.from("push_subscriptions").delete().eq("id", s.id);
              }
            }
          })
        );
      }
    }
  } catch (e) {
    console.error("[driver/notes] notify error", e);
  }

  return NextResponse.json({ ok: true, notatka: { id: nowa.id, tresc: nowa.tresc, autor: nowa.autor, odKierowcy: true, dataUtworzenia: nowa.dataUtworzenia } });
}
