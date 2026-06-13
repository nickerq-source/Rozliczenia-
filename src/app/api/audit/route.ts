import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase-server";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { getWebPush } from "@/lib/webpush";

export const runtime = "nodejs";

interface SubRow {
  id: string;
  user_name: string;
  subscription: object;
}

/**
 * Centralny zapis zmiany:
 * 1. audit_log (pełna historia)
 * 2. notifications_log (panel powiadomień)
 * 3. Web Push do subskrybentów workspace poza autorem
 * Autoryzacja: wymagana sesja; workspace brany z profilu (nie z body).
 */
export async function POST(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  }

  let body: {
    action?: string;
    entity?: string;
    entityId?: string;
    url?: string;
    oldValue?: unknown;
    newValue?: unknown;
    description?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy JSON" }, { status: 400 });
  }

  const { action = "zmiana", entity = "workspace", entityId, oldValue, newValue } = body;
  const url = body.url ?? "/dashboard";
  const description = body.description ?? "";
  if (!description) {
    return NextResponse.json({ error: "Brak description" }, { status: 400 });
  }

  const workspaceId = profile.workspace_id;
  const userName = profile.name;

  try {
    const admin = getAdminSupabase();

    const { error: auditError } = await admin.from("audit_log").insert({
      workspace_id: workspaceId,
      user_id: profile.id,
      user_name: userName,
      action,
      entity,
      entity_id: entityId ?? null,
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
      description,
    });
    if (auditError) {
      throw new Error(`audit_log: ${auditError.message}`);
    }

    const notificationPayload = {
      workspace_id: workspaceId,
      user_name: userName,
      action,
      description,
      url,
      read: false,
    };
    const { error: notificationError } = await admin.from("notifications_log").insert(notificationPayload);
    if (notificationError) {
      if (notificationError.message.toLowerCase().includes("url")) {
        const payloadWithoutUrl = {
          workspace_id: workspaceId,
          user_name: userName,
          action,
          description,
          read: false,
        };
        const { error: fallbackError } = await admin.from("notifications_log").insert(payloadWithoutUrl);
        if (fallbackError) throw new Error(`notifications_log: ${fallbackError.message}`);
      } else {
        throw new Error(`notifications_log: ${notificationError.message}`);
      }
    }

    // Push do subskrybentów workspace (poza autorem)
    const wp = getWebPush();
    if (wp) {
      const { data: subs } = await admin
        .from("push_subscriptions")
        .select("id, user_name, subscription")
        .eq("workspace_id", workspaceId);

      if (subs?.length) {
        const payload = JSON.stringify({
          title: "PapiTrans",
          body: description,
          url,
        });

        await Promise.all(
          (subs as SubRow[]).map(async (s) => {
            if (s.user_name === userName) return;
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

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Błąd serwera" },
      { status: 503 }
    );
  }
}
