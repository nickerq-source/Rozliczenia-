// Klient Supabase z SERVICE ROLE — omija RLS. TYLKO po stronie serwera
// (crony, wysyłka push, widok wypłaty kierowcy liczony z danych admina).

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

export function getAdminSupabase(): SupabaseClient {
  if (_admin) return _admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Brakuje NEXT_PUBLIC_SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY w env."
    );
  }

  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}
