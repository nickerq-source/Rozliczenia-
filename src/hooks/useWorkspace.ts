"use client";

// Hook zarządzający stanem workspace: ładowanie, autozapis z debounce
// Zapis: próbuje Supabase API, fallback do localStorage

import { useState, useEffect, useCallback, useRef } from "react";
import { WorkspaceData, DaneMiesiaca, MiesiącId, Notatka, UstawieniaPodatkowe } from "@/lib/types";
import { domyslneDaneMiesiaca } from "@/lib/business-logic";
import { MIESIACE_ZAKRESU } from "@/lib/dates";
import { DEFAULT_FUEL_VEHICLE, recalculateWorkspaceFuelChains } from "@/lib/recalculate-fuel-chain";

const DEBOUNCE_MS = 500;

function localKey(token: string) {
  return `flota2026_${token}`;
}

function loadFromLocalStorage(token: string): WorkspaceData | null {
  try {
    const raw = localStorage.getItem(localKey(token));
    if (!raw) return null;
    return JSON.parse(raw) as WorkspaceData;
  } catch {
    return null;
  }
}

function saveToLocalStorage(token: string, data: WorkspaceData) {
  try {
    localStorage.setItem(localKey(token), JSON.stringify(data));
  } catch {
    // Brak miejsca lub SSR — ignoruj
  }
}

function initWorkspaceData(): WorkspaceData {
  const miesiace: Partial<Record<MiesiącId, DaneMiesiaca>> = {};
  for (const m of MIESIACE_ZAKRESU) {
    miesiace[m] = domyslneDaneMiesiaca(m);
  }
  return { miesiace, vehicles: [DEFAULT_FUEL_VEHICLE] };
}

function mergeWithDefaults(remote: WorkspaceData): WorkspaceData {
  const merged = { ...remote, ...initWorkspaceData() };
  for (const m of MIESIACE_ZAKRESU) {
    if (remote.miesiace?.[m]) {
      merged.miesiace[m] = {
        ...domyslneDaneMiesiaca(m),
        ...remote.miesiace[m],
      };
    }
  }
  merged.notatki = remote.notatki ?? [];
  merged.ustawienia = remote.ustawienia ?? {};
  merged.vehicles = remote.vehicles?.length ? remote.vehicles : [DEFAULT_FUEL_VEHICLE];
  merged.podatkiOplacone = remote.podatkiOplacone; // ślad „podatki opłacone" — nie gubić przy ładowaniu
  return recalculateWorkspaceFuelChains(merged).data;
}

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export function useWorkspace(token: string) {
  const [data, setData] = useState<WorkspaceData>(initWorkspaceData());
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Flaga: pierwsze załadowanie — nie zapisuj automatycznie od razu
  const initialized = useRef(false);
  const revision = useRef<string | null>(null);
  const lastSaved = useRef("");
  const saveQueue = useRef(Promise.resolve());
  const conflict = useRef(false);
  const latest = useRef(data);
  latest.current = data;

  // Ładowanie danych przy pierwszym renderze
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/workspace/${token}`);
        if (res.ok) {
          const json = await res.json();
          const loaded = mergeWithDefaults(json.data as WorkspaceData);
          revision.current = json.updated_at;
          lastSaved.current = JSON.stringify(loaded);
          setData(loaded);
          return;
        }
        // 404 = nowy workspace, sprawdź localStorage
      } catch {
        // Błąd sieci — sprawdź localStorage
      }

      const local = loadFromLocalStorage(token);
      if (local) setData(mergeWithDefaults(local));
    }

    load().finally(() => {
      setLoading(false);
      initialized.current = true;
    });
  }, [token]);

  // Autozapis z debounce 500ms po każdej zmianie danych
  useEffect(() => {
    if (!initialized.current || loading || JSON.stringify(data) === lastSaved.current) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");

    saveTimer.current = setTimeout(() => {
      // Local recovery copy; success is shown only after the server confirms it.
      saveToLocalStorage(token, data);

      saveQueue.current = saveQueue.current.then(async () => { try {
        if (!revision.current || conflict.current) { setSaveStatus(conflict.current ? "conflict" : "error"); return; }
        const res = await fetch(`/api/workspace/${token}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "If-Match": revision.current },
          body: JSON.stringify(data),
        });
        if (res.status === 409) conflict.current = true;
        if (res.ok) { const json = await res.json(); revision.current = json.updated_at; lastSaved.current = JSON.stringify(data); }
        setSaveStatus(res.ok ? JSON.stringify(latest.current) === lastSaved.current ? "saved" : "saving" : res.status === 409 ? "conflict" : "error");
      } catch {
        setSaveStatus("error");
      } });
    }, DEBOUNCE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, token, loading]);

  /** Aktualizuj dowolne pole w danych miesiąca */
  const updateMiesiac = useCallback(
    (miesiac: MiesiącId, updater: (prev: DaneMiesiaca) => DaneMiesiaca) => {
      setData((prev) =>
        recalculateWorkspaceFuelChains({
          ...prev,
          miesiace: {
            ...prev.miesiace,
            [miesiac]: updater(prev.miesiace[miesiac] ?? domyslneDaneMiesiaca(miesiac)),
          },
        }).data
      );
    },
    []
  );

  /** Aktualizuj całe dane workspace, gdy operacja dotyczy więcej niż jednego miesiąca. */
  const updateWorkspace = useCallback((updater: (prev: WorkspaceData) => WorkspaceData) => {
    setData((prev) => recalculateWorkspaceFuelChains(updater(prev)).data);
  }, []);

  /** Aktualizuj listę notatek workspace */
  const updateNotatki = useCallback(
    (updater: (prev: Notatka[]) => Notatka[]) => {
      setData((prev) => ({
        ...prev,
        notatki: updater(prev.notatki ?? []),
      }));
    },
    []
  );

  /** Aktualizuj ustawienia podatkowe workspace */
  const updateUstawienia = useCallback(
    (patch: Partial<UstawieniaPodatkowe>) => {
      setData((prev) => ({
        ...prev,
        ustawienia: { ...(prev.ustawienia ?? {}), ...patch },
      }));
    },
    []
  );

  return { data, loading, saveStatus, updateMiesiac, updateWorkspace, updateNotatki, updateUstawienia };
}
