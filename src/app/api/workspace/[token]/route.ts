import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, getSessionProfile } from "@/lib/supabase-server";
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
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "admin" || profile.workspace_id !== token) return NextResponse.json({ error: "Brak dostępu" }, { status: 403 });
  const body = (await req.json()) as WorkspaceData;
  const supabase = await getServerSupabase();
  const { data: current, error: readError } = await supabase.from("workspaces").select("data, updated_at").eq("id", token).single();
  if (readError || !current) return NextResponse.json({ error: "Nie udało się odczytać danych" }, { status: 503 });
  const revision = req.headers.get("if-match");
  if (!revision || revision !== current.updated_at) return NextResponse.json({ error: "Dane zmieniły się lub aplikacja jest nieaktualna. Odśwież panel przed kolejnym zapisem." }, { status: 409 });
  if (!body?.miesiace || typeof body.miesiace !== "object") return NextResponse.json({ error: "Nieprawidłowe dane" }, { status: 400 });
  // Legacy full-workspace saves cannot alter or erase the separately audited payroll.
  body.fleetHistory = current.data.fleetHistory;
  for (const [key, month] of Object.entries(current.data.miesiace as WorkspaceData["miesiace"])) {
    if (month?.rafal) {
      const m = Number(key) as keyof WorkspaceData["miesiace"];
      if (!body.miesiace[m]) return NextResponse.json({ error: "Nie można usunąć miesiąca z danymi Rafała." }, { status: 400 });
      body.miesiace[m]!.rafal = month.rafal;
    }
  }
  const recalculated = recalculateWorkspaceFuelChains(body).data;
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(current.updated_at) + 1)).toISOString();

  const { data: saved, error } = await supabase
    .from("workspaces")
    .update({ data: recalculated, updated_at: updatedAt })
    .eq("id", token).eq("updated_at", revision).select("updated_at").maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!saved) return NextResponse.json({ error: "Dane zmieniły się podczas zapisu. Odśwież panel." }, { status: 409 });
  return NextResponse.json({ ok: true, data: recalculated, updated_at: saved.updated_at });
}
