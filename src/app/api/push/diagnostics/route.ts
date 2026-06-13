import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase-server";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { getWebPush } from "@/lib/webpush";

export const runtime = "nodejs";

export async function GET() {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  }

  try {
    const admin = getAdminSupabase();
    const { data: subs, error: subsError } = await admin
      .from("push_subscriptions")
      .select("id, user_id, user_name, created_at")
      .eq("workspace_id", profile.workspace_id)
      .order("created_at", { ascending: false });
    if (subsError) throw new Error(subsError.message);

    const { data: lastTest } = await admin
      .from("notifications_log")
      .select("description, created_at")
      .eq("workspace_id", profile.workspace_id)
      .eq("action", "test_push")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const ownSubscriptions = (subs ?? []).filter((s) => s.user_id === profile.id);

    return NextResponse.json({
      pushConfigured: !!getWebPush(),
      subscriptions: subs?.length ?? 0,
      currentUserSubscriptions: ownSubscriptions.length,
      currentDeviceSaved: ownSubscriptions.length > 0,
      lastTest: lastTest ?? null,
      lastError: null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Błąd diagnostyki push" },
      { status: 503 }
    );
  }
}
