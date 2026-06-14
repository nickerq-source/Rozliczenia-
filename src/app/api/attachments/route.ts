import { NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/supabase-server";
import { uploadParagon, removeParagon } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Załączniki kosztów w Supabase Storage. Upload (admin i kierowca) oraz
 * usunięcie (admin). W JSONB trzymamy tylko ścieżkę — dzięki temu blob
 * `workspaces.data` zostaje mały, a zdjęcia nie obciążają odczytu/zapisu.
 */

// POST { image: dataUrl } → { path, mime }
export async function POST(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "admin" && profile.role !== "driver") {
    return NextResponse.json({ error: "Brak dostępu" }, { status: 403 });
  }

  let body: { image?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy JSON" }, { status: 400 });
  }

  if (typeof body.image !== "string" || !body.image.startsWith("data:image/")) {
    return NextResponse.json({ error: "Brak prawidłowego obrazu" }, { status: 400 });
  }

  const res = await uploadParagon(profile.workspace_id, body.image);
  if (!res) {
    return NextResponse.json({ error: "Nie udało się wgrać pliku" }, { status: 502 });
  }
  return NextResponse.json(res);
}

// DELETE { path } — tylko admin; ścieżka musi należeć do jego workspace
export async function DELETE(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "admin") {
    return NextResponse.json({ error: "Brak dostępu" }, { status: 403 });
  }

  let body: { path?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy JSON" }, { status: 400 });
  }

  const path = body.path;
  if (typeof path !== "string" || !path.startsWith(`${profile.workspace_id}/`)) {
    return NextResponse.json({ error: "Nieprawidłowa ścieżka" }, { status: 400 });
  }

  await removeParagon(path);
  return NextResponse.json({ ok: true });
}
