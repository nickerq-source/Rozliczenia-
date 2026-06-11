"use client";

// Audit log klienta — każda zmiana trafia do /api/audit (fire-and-forget):
// audit_log + notifications_log + push do adminów workspace (poza autorem)

export interface AuditParams {
  workspaceId: string;
  userName: string;
  action: string; // np. "faktura_zapisana", "miesiac_zamkniety"
  entity: string; // np. "invoice", "note", "month"
  entityId?: string;
  url?: string;
  oldValue?: unknown;
  newValue?: unknown;
  description: string; // tekst widoczny w powiadomieniach i historii
}

export function logChange(params: AuditParams) {
  fetch("/api/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).catch(() => {});
}
