// Wspólne ustawienia sesji Supabase.
// Dzięki maxAge cookie z refresh tokenem zostaje po zamknięciu przeglądarki/PWA.
export const AUTH_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 365,
};
