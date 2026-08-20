// API tylko dla roli „logistyk": zwraca jego rozliczenie za każdy miesiąc
// (12% ze zleceń + 5% z na-czysto + 600 za auta). Logistyk NIE ma RLS do
// workspaces — dane czytamy service-rolem i zwracamy wyłącznie to, co jego
// dotyczy (bez pełnych finansów firmy).

import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase-server";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { MIESIACE_ZAKRESU } from "@/lib/dates";
import { obliczLogistyka, LOGISTYK_START_MONTH } from "@/lib/logistyk";
import { WorkspaceData, MiesiącId } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "logistyk") {
    return NextResponse.json({ error: "Tylko dla logistyka" }, { status: 403 });
  }

  const { data: ws, error } = await getAdminSupabase()
    .from("workspaces")
    .select("data")
    .eq("id", profile.workspace_id)
    .single();
  if (error || !ws) {
    return NextResponse.json({ error: "Workspace nie znaleziony" }, { status: 404 });
  }

  const data = (ws.data ?? {}) as WorkspaceData;
  const miesiace = MIESIACE_ZAKRESU.filter((m) => m >= LOGISTYK_START_MONTH)
    .map((m) => obliczLogistyka(data, m as MiesiącId))
    .filter((r) => r.razem > 0 || r.zleceniaNettoRazem > 0 || r.zleceniaReczne.length > 0);
  const razemOkres = Math.round(miesiace.reduce((s, r) => s + r.razem, 0) * 100) / 100;

  return NextResponse.json({ imie: profile.name, miesiace, razemOkres });
}
