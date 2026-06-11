// Wspólne narzędzia cronów: autoryzacja CRON_SECRET + wysyłka push do workspace

import { NextRequest } from "next/server";
import { getAdminSupabase } from "./supabase-admin";
import { getWebPush } from "./webpush";

/** Vercel Cron wysyła Authorization: Bearer {CRON_SECRET} */
export function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // brak sekretu = brak ochrony (lokalny dev)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Push do wszystkich subskrybentów workspace + wpis w notifications_log */
export async function notifyWorkspace(
  workspaceId: string,
  action: string,
  description: string
): Promise<number> {
  const admin = getAdminSupabase();

  await admin.from("notifications_log").insert({
    workspace_id: workspaceId,
    user_name: "system",
    action,
    description,
    read: false,
  });

  const wp = getWebPush();
  if (!wp) return 0;

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, subscription")
    .eq("workspace_id", workspaceId);
  if (!subs?.length) return 0;

  const payload = JSON.stringify({ title: "PapiTrans", body: description, url: "/dashboard" });
  let sent = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await wp.sendNotification(
          s.subscription as Parameters<typeof wp.sendNotification>[0],
          payload
        );
        sent++;
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
