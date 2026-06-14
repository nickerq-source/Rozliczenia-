import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase-server";
import { signedParagonUrl } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Krótkotrwały podpisany URL do podglądu załącznika. Ścieżka musi należeć do
 * workspace zalogowanego użytkownika (prefiks <workspace_id>/), więc nie da się
 * podejrzeć cudzych plików.
 */
export async function GET(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "admin" && profile.role !== "driver") {
    return NextResponse.json({ error: "Brak dostępu" }, { status: 403 });
  }

  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!path.startsWith(`${profile.workspace_id}/`)) {
    return NextResponse.json({ error: "Nieprawidłowa ścieżka" }, { status: 400 });
  }

  const url = await signedParagonUrl(path);
  if (!url) {
    return NextResponse.json({ error: "Nie udało się utworzyć linku" }, { status: 502 });
  }
  return NextResponse.json({ url });
}
