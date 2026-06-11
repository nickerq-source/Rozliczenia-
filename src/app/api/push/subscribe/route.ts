import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase-server";
import { getAdminSupabase } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// Zapis subskrypcji push — przypisana do zalogowanego konta i jego workspace.
// Jedno urządzenie (endpoint) = jeden wpis.
export async function POST(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  }

  let subscription: { endpoint?: string };
  try {
    subscription = (await req.json()).subscription;
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy JSON" }, { status: 400 });
  }
  if (!subscription?.endpoint) {
    return NextResponse.json({ error: "Brak subscription" }, { status: 400 });
  }

  try {
    const admin = getAdminSupabase();

    // Unikalność po endpoint (indeks na wyrażeniu) — usuń stary wpis i wstaw nowy
    await admin
      .from("push_subscriptions")
      .delete()
      .eq("subscription->>endpoint", subscription.endpoint);

    const { error } = await admin.from("push_subscriptions").insert({
      workspace_id: profile.workspace_id,
      user_id: profile.id,
      user_name: profile.name,
      subscription,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Błąd serwera" },
      { status: 503 }
    );
  }
}
