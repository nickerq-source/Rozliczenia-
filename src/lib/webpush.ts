// Konfiguracja web-push (VAPID) po stronie serwera — lazy, jak supabase

import webpush from "web-push";

let configured = false;

/** Zwraca skonfigurowany moduł web-push albo null gdy brak kluczy VAPID */
export function getWebPush(): typeof webpush | null {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return null;

  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:admin@papitrans.pl",
      pub,
      priv
    );
    configured = true;
  }
  return webpush;
}
