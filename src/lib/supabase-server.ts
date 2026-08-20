// Klient Supabase po stronie serwera (RSC / route handlers) — sesja z cookies.
// Zapytania wykonują się z uprawnieniami zalogowanego użytkownika (RLS działa).

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { AUTH_COOKIE_OPTIONS } from "./auth-config";

export async function getServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // wywołanie z RSC — middleware odświeży sesję
          }
        },
      },
    }
  );
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: "admin" | "driver" | "logistyk";
  workspace_id: string;
}

/** Zalogowany użytkownik + profil; null gdy brak sesji, profilu lub konfiguracji */
export async function getSessionProfile(): Promise<Profile | null> {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, name, role, workspace_id")
      .eq("id", user.id)
      .single();

    if (!profile) return null;
    const p = profile as Profile;
    // Logistyk trzymany w bazie jako role='driver' + name='Logistyk' (CHECK na
    // profiles.role nie dopuszcza jeszcze 'logistyk'). Mapujemy na efektywną rolę
    // logistyk: dzięki temu API kierowcy (if role !== 'driver') go odrzucają
    // (brak wycieku danych kierowcy), a routing/panel logistyka działają.
    if (p.role === "driver" && p.name === "Logistyk") {
      return { ...p, role: "logistyk" };
    }
    return p;
  } catch {
    // Brak env Supabase (lokalny dev bez konfiguracji)
    return null;
  }
}
