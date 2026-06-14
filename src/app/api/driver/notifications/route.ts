import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase-server";
import { getAdminSupabase } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Powiadomienia dla kierowcy. Kierowca NIE widzi wewnętrznych zdarzeń (faktury,
 * koszty, ustawienia, wewnętrzne notatki). Whitelist akcji ogranicza wynik do
 * spraw kierowcy: dniówka/wypłata, obciążenia, notatki do niego.
 */
const DOZWOLONE_AKCJE = [
  "wyplata_zmieniona", // dodanie/zmiana dniówki (kółka/szkolenie)
  "wyplata_oznaczona", // wypłata oznaczona jako wypłacona
  "wyplata_cofnieta",
  "obciazenie_dodane",
  "obciazenie_usuniete",
  "notatka_kierowca", // notatka napisana do kierowcy
];

export async function GET() {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "driver") {
    return NextResponse.json({ error: "Tylko dla kierowcy" }, { status: 403 });
  }

  const { data, error } = await getAdminSupabase()
    .from("notifications_log")
    .select("id, action, description, created_at")
    .eq("workspace_id", profile.workspace_id)
    .in("action", DOZWOLONE_AKCJE)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  // Bez url — linki prowadzą do /admin, kierowca i tak ich nie otworzy.
  const notifications = (data ?? []).map((n) => ({
    id: n.id,
    action: n.action,
    description: n.description,
    created_at: n.created_at,
  }));

  return NextResponse.json({ notifications });
}
