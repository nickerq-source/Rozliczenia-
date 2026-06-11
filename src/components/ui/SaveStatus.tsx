"use client";

// Pill statusu zapisu — „Zapisano ✓" znika po 1,5 s; błąd zostaje, nie blokuje UI

import { useEffect, useState } from "react";
import { SaveStatus } from "@/hooks/useWorkspace";
import { IconCheck, IconAlertTriangle, IconLoader } from "./icons";

export function SaveStatusBadge({ status }: { status: SaveStatus }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status === "idle") {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (status === "saved") {
      const t = setTimeout(() => setVisible(false), 1500);
      return () => clearTimeout(t);
    }
  }, [status]);

  if (!visible) return null;

  if (status === "error") {
    return (
      <span className="animate-slide-down flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-soft border border-red-500/40 text-red-300 text-xs font-medium">
        <IconAlertTriangle size={14} />
        Błąd zapisu
      </span>
    );
  }

  if (status === "saving") {
    return (
      <span className="animate-slide-down flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface2 border border-line text-dim text-xs font-medium">
        <IconLoader size={14} />
        Zapisywanie…
      </span>
    );
  }

  return (
    <span className="animate-slide-down flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-soft border border-green-500/40 text-green-300 text-xs font-medium">
      <IconCheck size={14} />
      Zapisano
    </span>
  );
}
