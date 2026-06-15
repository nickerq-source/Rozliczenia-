import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { getSessionProfile } from "@/lib/supabase-server";
import { normalizeDriverLanguage } from "@/lib/driver-translations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: "Tylko dla kierowcy" }, { status: 403 });
}

export async function GET() {
  const profile = await getSessionProfile();
  if (!profile) return unauthorized();
  if (profile.role !== "driver") return forbidden();

  try {
    const { data, error } = await getAdminSupabase()
      .from("profiles")
      .select("preferred_language")
      .eq("id", profile.id)
      .single();

    if (error) {
      console.error("[driver/language] read error", error);
      return NextResponse.json({ language: "pl" });
    }

    return NextResponse.json({
      language: normalizeDriverLanguage(data?.preferred_language),
    });
  } catch (err) {
    console.error("[driver/language] read exception", err);
    return NextResponse.json({ language: "pl" });
  }
}

export async function PATCH(req: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return unauthorized();
  if (profile.role !== "driver") return forbidden();

  let body: { language?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy JSON" }, { status: 400 });
  }

  const language = normalizeDriverLanguage(body.language);
  if (body.language !== "pl" && body.language !== "ru") {
    return NextResponse.json({ error: "Nieprawidłowy język" }, { status: 400 });
  }

  const { error } = await getAdminSupabase()
    .from("profiles")
    .update({ preferred_language: language })
    .eq("id", profile.id);

  if (error) {
    console.error("[driver/language] save error", error);
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  return NextResponse.json({ ok: true, language });
}
