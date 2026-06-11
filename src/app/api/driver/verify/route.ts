import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase-server";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { getWebPush } from "@/lib/webpush";
import { parseNum } from "@/lib/business-logic";
import { DaneMiesiaca, MiesiącId, WorkspaceData, ZgloszenieDnia } from "@/lib/types";

export const runtime = "nodejs";

interface SubRow {
  id: string;
  user_name: string;
  subscription: object;
}

/**
 * Weryfikacja dnia przez kierowcę.
 * body: { miesiac, dzien, akcja: "akceptuj" | "zglos", kolkaProponowane?, uwaga? }
 *
 * Kierowca nie ma RLS-owego dostępu do workspaces — zapis idzie przez service
 * role (read-modify-write tablicy `zgloszenia` w danych miesiąca). Zgłoszenie
 * błędu generuje powiadomienie (+ push) do adminów z deep-linkiem do kosztów.
 */
export async function POST(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "driver") {
    return NextResponse.json({ error: "Tylko dla kierowcy" }, { status: 403 });
  }

  let body: {
    miesiac?: number;
    dzien?: string;
    akcja?: "akceptuj" | "zglos";
    kolkaProponowane?: number;
    uwaga?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy JSON" }, { status: 400 });
  }

  const miesiac = Number(body.miesiac) as MiesiącId;
  const dzien = body.dzien;
  const akcja = body.akcja;
  if (!miesiac || !dzien || (akcja !== "akceptuj" && akcja !== "zglos")) {
    return NextResponse.json({ error: "Brak wymaganych pól" }, { status: 400 });
  }

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
  const dane = (wsData.miesiace?.[miesiac] ?? { dni: {} }) as DaneMiesiaca;
  const kolkaSystem = parseNum(dane.dni?.[dzien]?.kolka);

  const zgloszenia: ZgloszenieDnia[] = [...(dane.zgloszenia ?? [])];
  const istniejacyIdx = zgloszenia.findIndex((z) => z.dzien === dzien);

  const wpis: ZgloszenieDnia = {
    id:
      istniejacyIdx >= 0
        ? zgloszenia[istniejacyIdx].id
        : `${miesiac}-${dzien}-${Date.now()}`,
    dzien,
    kolkaSystem,
    utworzono:
      istniejacyIdx >= 0 ? zgloszenia[istniejacyIdx].utworzono : new Date().toISOString(),
    status: akcja === "akceptuj" ? "zaakceptowany" : "zgloszony",
  };

  if (akcja === "zglos") {
    wpis.kolkaProponowane =
      body.kolkaProponowane !== undefined ? parseNum(body.kolkaProponowane) : undefined;
    wpis.uwaga = (body.uwaga ?? "").trim() || undefined;
    wpis.utworzono = new Date().toISOString(); // ponowne zgłoszenie = świeży czas
  }

  if (istniejacyIdx >= 0) zgloszenia[istniejacyIdx] = wpis;
  else zgloszenia.push(wpis);

  const nowaData: WorkspaceData = {
    ...wsData,
    miesiace: {
      ...wsData.miesiace,
      [miesiac]: { ...dane, zgloszenia },
    },
  };

  const { error: saveErr } = await admin
    .from("workspaces")
    .update({ data: nowaData, updated_at: new Date().toISOString() })
    .eq("id", profile.workspace_id);

  if (saveErr) {
    return NextResponse.json({ error: saveErr.message }, { status: 503 });
  }

  // Zgłoszenie błędu → powiadomienie + push do adminów
  if (akcja === "zglos") {
    const dzienNr = dzien.slice(8);
    const propozycja =
      wpis.kolkaProponowane !== undefined
        ? ` (${kolkaSystem} → ${wpis.kolkaProponowane} kółek)`
        : "";
    const opis = `${profile.name} zgłosił błąd w dniu ${dzienNr}.${String(miesiac).padStart(2, "0")}${propozycja}${wpis.uwaga ? ` — „${wpis.uwaga}”` : ""}`;
    const url = `/admin?miesiac=${miesiac}&zakladka=koszty&zgloszenie=${encodeURIComponent(wpis.id)}`;

    try {
      const { error: auditErr } = await admin.from("audit_log").insert({
        workspace_id: profile.workspace_id,
        user_id: profile.id,
        user_name: profile.name,
        action: "zgloszenie_dnia",
        entity: "payroll_day",
        entity_id: dzien,
        old_value: { kolka: kolkaSystem },
        new_value: { kolka: wpis.kolkaProponowane ?? null, uwaga: wpis.uwaga ?? null },
        description: opis,
      });
      if (auditErr) {
        throw new Error(`audit_log: ${auditErr.message}`);
      }

      const { error: notificationErr } = await admin.from("notifications_log").insert({
        workspace_id: profile.workspace_id,
        user_name: profile.name,
        action: "zgloszenie_dnia",
        description: opis,
        url,
        read: false,
      });
      if (notificationErr) {
        throw new Error(`notifications_log: ${notificationErr.message}`);
      }

      const wp = getWebPush();
      if (wp) {
        const { data: subs } = await admin
          .from("push_subscriptions")
          .select("id, user_name, subscription")
          .eq("workspace_id", profile.workspace_id);

        if (subs?.length) {
          const payload = JSON.stringify({ title: "PapiTrans — zgłoszenie", body: opis, url });
          await Promise.all(
            (subs as SubRow[]).map(async (s) => {
              if (s.user_name === profile.name) return;
              try {
                await wp.sendNotification(
                  s.subscription as Parameters<typeof wp.sendNotification>[0],
                  payload
                );
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
      console.error("[driver/verify] notification error", e);
      // Powiadomienie nieobowiązkowe — zgłoszenie i tak zapisane
    }
  }

  return NextResponse.json({ ok: true, zgloszenia });
}
