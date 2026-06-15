import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase-server";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { getWebPush } from "@/lib/webpush";
import { czyWidoczneDlaKierowcy } from "@/lib/driver-visibility";

export const runtime = "nodejs";

interface SubRow {
  id: string;
  user_name: string;
  user_id: string | null;
  subscription: object;
}

interface PushResult {
  configured: boolean;
  subscriptions: number;
  sent: number;
  failed: number;
  removed: number;
}

/**
 * Centralny zapis zmiany:
 * 1. audit_log (pełna historia)
 * 2. notifications_log (panel powiadomień)
 * 3. Web Push do subskrybentów workspace, także autora zmiany
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
    const push: PushResult = {
      configured: false,
      subscriptions: 0,
      sent: 0,
      failed: 0,
      removed: 0,
    };

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

    // Push do subskrybentów workspace, także autora. Dzięki temu można od razu
    // testować powiadomienia na własnym telefonie po dodaniu kosztu/faktury.
    const wp = getWebPush();
    if (wp) {
      push.configured = true;
      const { data: subs } = await admin
        .from("push_subscriptions")
        .select("id, user_name, user_id, subscription")
        .eq("workspace_id", workspaceId);

      // Zdarzenia wewnętrzne (faktury, koszty, notatki admina) NIE mogą trafić
      // na telefon kierowcy — pomijamy jego subskrypcje. Sprawy kierowcy
      // (dniówka, obciążenia, notatka do niego) lecą do wszystkich.
      let driverIds: Set<string> | null = null;
      if (!czyWidoczneDlaKierowcy(action)) {
        const { data: drivers } = await admin
          .from("profiles")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("role", "driver");
        driverIds = new Set((drivers ?? []).map((d) => d.id as string));
      }

      if (subs?.length) {
        push.subscriptions = subs.length;
        const payload = JSON.stringify({
          title: "PapiTrans",
          body: description,
          url,
        });

        await Promise.all(
          (subs as SubRow[]).map(async (s) => {
            if (driverIds && s.user_id && driverIds.has(s.user_id)) return; // nie pushuj kierowcy
            try {
              await wp.sendNotification(
                s.subscription as Parameters<typeof wp.sendNotification>[0],
                payload
              );
              push.sent += 1;
            } catch (e: unknown) {
              push.failed += 1;
              const status = (e as { statusCode?: number })?.statusCode;
              if (status === 404 || status === 410) {
                await admin.from("push_subscriptions").delete().eq("id", s.id);
                push.removed += 1;
              }
            }
          })
        );
      }
    }

    return NextResponse.json({ ok: true, push });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Błąd serwera" },
      { status: 503 }
    );
  }
}
