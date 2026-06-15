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

function isPreferredLanguageColumnError(error: { code?: string; message?: string } | null) {
  return (
    error?.code === "42703" ||
    error?.message?.toLowerCase().includes("preferred_language") ||
    error?.message?.toLowerCase().includes("column")
  );
}

async function readLanguageFromAuthMetadata(userId: string) {
  const admin = getAdminSupabase();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) {
    console.error("[driver/language] auth metadata read error", error);
    return "pl";
  }

  return normalizeDriverLanguage(data.user?.user_metadata?.preferred_language);
}

async function writeLanguageToAuthMetadata(userId: string, language: "pl" | "ru") {
  const admin = getAdminSupabase();
  const { data: current, error: readError } = await admin.auth.admin.getUserById(userId);
  if (readError) {
    console.error("[driver/language] auth metadata pre-read error", readError);
    throw readError;
  }

  const metadata = current.user?.user_metadata ?? {};
  const { error } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { ...metadata, preferred_language: language },
  });
  if (error) {
    console.error("[driver/language] auth metadata save error", error);
    throw error;
  }
}

export async function GET() {
  const profile = await getSessionProfile();
  if (!profile) return unauthorized();
  if (profile.role !== "driver") return forbidden();

  try {
    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from("profiles")
      .select("preferred_language")
      .eq("id", profile.id)
      .single();

    if (error) {
      console.error("[driver/language] read error", error);
      if (isPreferredLanguageColumnError(error)) {
        return NextResponse.json({ language: await readLanguageFromAuthMetadata(profile.id) });
      }
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

  const admin = getAdminSupabase();
  const { error } = await admin
    .from("profiles")
    .update({ preferred_language: language })
    .eq("id", profile.id);

  if (error) {
    console.error("[driver/language] save error", error);
    if (isPreferredLanguageColumnError(error)) {
      try {
        await writeLanguageToAuthMetadata(profile.id, language);
        return NextResponse.json({ ok: true, language, source: "auth_metadata" });
      } catch (metadataError) {
        const message =
          metadataError instanceof Error ? metadataError.message : "Nie udało się zapisać języka.";
        return NextResponse.json({ error: message }, { status: 503 });
      }
    }
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  // Backup w koncie Auth. Źródłem prawdy jest profiles.preferred_language, ale
  // metadata pomaga utrzymać wybór, jeśli baza produkcyjna czeka na migrację.
  try {
    await writeLanguageToAuthMetadata(profile.id, language);
  } catch {
    // Nie blokuj UI, skoro zapis do profiles się udał.
  }

  return NextResponse.json({ ok: true, language });
}
