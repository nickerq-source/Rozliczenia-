"use client";

// Ekran logowania — Supabase Auth (email + hasło, bez publicznej rejestracji)

import { useState, useEffect } from "react";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { IconTruck, IconAlertTriangle, IconLoader } from "@/components/ui/icons";

// Logowanie nazwą konta (bez @) — wewnętrznie mapowane na syntetyczny email
const LOGIN_DOMAIN = "papitrans.local";
const LAST_LOGIN_KEY = "papitrans_last_login";

// Aliasy nazw kont, gdy email w Auth różni się od loginu (np. literówka papa/papi)
const LOGIN_ALIASES: Record<string, string> = {
  papiking: "papaking",
};

export default function LoginPage() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  // Zapamiętane konto z poprzedniego logowania
  useEffect(() => {
    const saved = localStorage.getItem(LAST_LOGIN_KEY);
    if (saved) setLogin(saved);
  }, []);

  // Jeśli użytkownik ma jeszcze ważną sesję, nie pokazuj mu ponownie logowania.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { session } } = await getBrowserSupabase().auth.getSession();
        if (active && session) window.location.replace("/dashboard");
      } catch {
        // Brak sesji albo chwilowy problem — zostajemy na formularzu logowania.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(false);
    setBusy(true);
    try {
      const supabase = getBrowserSupabase();
      // Konto → email: "PapiKing" → "papiking@papitrans.local" (z uwzględnieniem aliasów)
      const account = login.trim().toLowerCase();
      const mapped = LOGIN_ALIASES[account] ?? account;
      const email = `${mapped}@${LOGIN_DOMAIN}`;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(true);
        return;
      }
      // Sesja trzyma się w cookies (refresh token) — brak wylogowania przy
      // kolejnych wizytach; zapamiętaj też nazwę konta
      localStorage.setItem(LAST_LOGIN_KEY, login.trim());
      // Pełne przeładowanie — łańcuch serwerowych redirectów (/dashboard → /admin
      // lub /driver) wykonuje się jako pełne żądania; miękka nawigacja go gubi.
      window.location.assign("/dashboard");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4">
      {/* Tło jak w aplikacji */}
      <div
        className="fixed inset-0 z-0"
        style={{
          backgroundImage: "url('/papitrans-bg.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center top",
          filter: "saturate(1.35) contrast(1.08)",
        }}
        aria-hidden
      />
      <div className="fixed inset-0 z-0" style={{ background: "rgba(7, 12, 9, 0.82)" }} aria-hidden />

      <div className="relative z-[1] w-full max-w-xs">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <IconTruck size={36} className="text-amber-brand mb-2" />
          <span className="logo-gem text-[32px] leading-none">PapiTrans</span>
          <span className="logo-subtitle text-[11px] mt-1">El Jefe de la Ruta</span>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-surface rounded-2xl border border-line p-5 space-y-3 shadow-2xl"
        >
          <div>
            <label className="block text-xs text-dim mb-1">Konto</label>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              placeholder="np. PapiKing"
              required
              className="w-full bg-input border border-line rounded-[10px] px-3 py-2.5 text-[15px] text-ink placeholder:text-dim/40"
            />
          </div>
          <div>
            <label className="block text-xs text-dim mb-1">Hasło</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full bg-input border border-line rounded-[10px] px-3 py-2.5 pr-10 text-[15px] text-ink"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dim hover:text-ink transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? "Ukryj hasło" : "Pokaż hasło"}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-red-soft border border-red-500/40 text-red-300 text-xs font-medium animate-fade-in">
              <IconAlertTriangle size={14} />
              Nieprawidłowy email lub hasło
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 min-h-[44px] rounded-xl bg-amber-brand text-amber-ink font-bold text-sm hover:bg-[#e09420] disabled:opacity-50 transition-all duration-150 flex items-center justify-center gap-2"
          >
            {busy && <IconLoader size={15} />}
            Zaloguj się
          </button>
        </form>
      </div>
    </div>
  );
}
