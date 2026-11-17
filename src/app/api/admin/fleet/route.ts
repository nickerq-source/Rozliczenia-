import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, getSessionProfile } from "@/lib/supabase-server";
import { applyFleetCommand, FleetInputError, type FleetCommand } from "@/lib/fleet-commands";
import type { WorkspaceData } from "@/lib/types";

export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Zaloguj się ponownie." }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Brak dostępu." }, { status: 403 });
  try {
    const raw = await req.text();
    if (raw.length > 6_000_000) return NextResponse.json({ error: "Za duże żądanie." }, { status: 413 });
    const body = JSON.parse(raw) as { revision: string; command: FleetCommand };
    const supabase = await getServerSupabase();
    const { data: current, error } = await supabase.from("workspaces").select("data, updated_at").eq("id", profile.workspace_id).single();
    if (error || !current?.data?.miesiace) return NextResponse.json({ error: "Nie udało się odczytać danych firmy." }, { status: 503 });
    if (!body.revision || body.revision !== current.updated_at) return NextResponse.json({ error: "Dane zmieniły się w innej karcie. Odśwież panel przed zapisem." }, { status: 409 });
    const result = applyFleetCommand(current.data as WorkspaceData, body.command, profile.name, crypto.randomUUID(), new Date().toISOString());
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(current.updated_at) + 1)).toISOString();
    // Data and its undo/audit record are committed together under session RLS.
    const saved = await supabase.from("workspaces").update({ data: result.data, updated_at: updatedAt }).eq("id", profile.workspace_id).eq("updated_at", body.revision).select("updated_at").maybeSingle();
    if (saved.error) return NextResponse.json({ error: "Nie zapisano danych. Spróbuj ponownie." }, { status: 503 });
    if (!saved.data) return NextResponse.json({ error: "Ktoś zmienił dane w trakcie zapisu. Odśwież panel." }, { status: 409 });
    return NextResponse.json({ data: result.data, updated_at: saved.data.updated_at, message: result.description });
  } catch (error) {
    return NextResponse.json({ error: error instanceof FleetInputError ? error.message : "Nieprawidłowe dane. Sprawdź formularz." }, { status: 400 });
  }
}
