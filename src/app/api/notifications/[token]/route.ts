import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, getSessionProfile } from "@/lib/supabase-server";

export const runtime = "nodejs";

// token = workspace UUID (parametr ignorowany przy autoryzacji — RLS i profil decydują)
type Params = { params: Promise<{ token: string }> };

/** Ostatnie 50 powiadomień workspace (RLS: tylko admin) */
export async function GET(_req: NextRequest, { params }: Params) {
  await params;
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });

  const supabase = await getServerSupabase();
  const baseQuery = supabase
    .from("notifications_log")
    .select("id, user_name, action, description, url, read, created_at")
    .eq("workspace_id", profile.workspace_id)
    .order("created_at", { ascending: false })
    .limit(50);
  let { data, error } = await baseQuery;

  if (error && error.message.toLowerCase().includes("url")) {
    const fallback = await supabase
      .from("notifications_log")
      .select("id, user_name, action, description, read, created_at")
      .eq("workspace_id", profile.workspace_id)
      .order("created_at", { ascending: false })
      .limit(50);
    data = fallback.data?.map((n) => ({ ...n, url: null })) ?? null;
    error = fallback.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ notifications: data ?? [] });
}

/** { action: "read" } — oznacz wszystkie jako przeczytane; { action: "clear" } — wyczyść */
export async function POST(req: NextRequest, { params }: Params) {
  await params;
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });

  let action = "";
  try {
    action = (await req.json()).action;
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy JSON" }, { status: 400 });
  }

  const supabase = await getServerSupabase();

  if (action === "read") {
    const { error } = await supabase
      .from("notifications_log")
      .update({ read: true })
      .eq("workspace_id", profile.workspace_id)
      .eq("read", false);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "clear") {
    const { error } = await supabase
      .from("notifications_log")
      .delete()
      .eq("workspace_id", profile.workspace_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Nieznana akcja" }, { status: 400 });
}
