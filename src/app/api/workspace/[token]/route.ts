import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { recalculateWorkspaceFuelChains } from "@/lib/recalculate-fuel-chain";
import type { WorkspaceData } from "@/lib/types";

export const runtime = "nodejs";

// token = UUID workspace. Zapytania idą z sesją użytkownika — RLS dopuszcza
// wyłącznie admina przypiętego do tego workspace.
type Params = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const supabase = await getServerSupabase();

  const { data, error } = await supabase
    .from("workspaces")
    .select("data, updated_at")
    .eq("id", token)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Workspace nie znaleziony" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const body = (await req.json()) as WorkspaceData;
  const recalculated = recalculateWorkspaceFuelChains(body).data;
  const supabase = await getServerSupabase();

  const { error } = await supabase
    .from("workspaces")
    .update({ data: recalculated, updated_at: new Date().toISOString() })
    .eq("id", token);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: recalculated });
}
