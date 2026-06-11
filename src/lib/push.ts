"use client";

// Klient Web Push: rejestracja Service Workera, subskrypcja, wysyłka zdarzeń.
// Zdarzenia idą przez /api/audit → audit_log + notifications_log + push.

import { logChange } from "./audit";

export const USER_KEY = "papitrans_user";
export const PUSH_ENABLED_KEY = "papitrans_push_enabled";

export function getUserName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(USER_KEY) ?? "";
}

export function setUserName(name: string) {
  localStorage.setItem(USER_KEY, name.trim());
}

/** Czy ta przeglądarka obsługuje Web Push */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Zarejestruj SW i subskrybuj push; subskrypcja przypisana do zalogowanego konta. */
export async function subscribePush(): Promise<boolean> {
  if (!pushSupported()) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
      ),
    });
  }

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });

  if (res.ok) {
    localStorage.setItem(PUSH_ENABLED_KEY, "1");
    return true;
  }
  return false;
}

/** Wyłącz subskrypcję na tym urządzeniu */
export async function unsubscribePush(): Promise<void> {
  localStorage.removeItem(PUSH_ENABLED_KEY);
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
  } catch {
    // ignoruj — lokalne wyłączenie wystarczy
  }
}

/** Czy push jest aktywny na tym urządzeniu (zgoda + subskrypcja) */
export async function isPushActive(): Promise<boolean> {
  if (!pushSupported()) return false;
  if (Notification.permission !== "granted") return false;
  if (localStorage.getItem(PUSH_ENABLED_KEY) !== "1") return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    return !!(await reg?.pushManager.getSubscription());
  } catch {
    return false;
  }
}

export type PushEventType = "faktura" | "notatka" | "koszt";

/** Zgłoś zdarzenie: audit log + powiadomienia + push (fire-and-forget) */
export function sendPushEvent(opts: {
  token: string; // workspace id (autoryzację i tak robi serwer z sesji)
  author: string;
  eventType: PushEventType;
  body: string;
  url?: string;
}) {
  logChange({
    workspaceId: opts.token,
    userName: opts.author,
    action: opts.eventType,
    entity: opts.eventType,
    description: opts.body,
    url: opts.url,
  });
}
