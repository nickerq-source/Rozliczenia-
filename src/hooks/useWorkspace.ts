"use client";

// Hook zarządzający stanem workspace: ładowanie, autozapis z debounce
// Zapis: próbuje Supabase API, fallback do localStorage

import { useState, useEffect, useCallback, useRef } from "react";
import { WorkspaceData, DaneMiesiaca, MiesiącId, Notatka, UstawieniaPodatkowe } from "@/lib/types";
import { domyslneDaneMiesiaca } from "@/lib/business-logic";
import { MIESIACE_ZAKRESU } from "@/lib/dates";
import { DEFAULT_FUEL_VEHICLE, recalculateWorkspaceFuelChains } from "@/lib/recalculate-fuel-chain";
import type { FleetCommand } from "@/lib/fleet-commands";

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
  const [fleetBusy, setFleetBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const fleetInFlight = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Flaga: pierwsze załadowanie — nie zapisuj automatycznie od razu
  const initialized = useRef(false);
  const revision = useRef<string | null>(null);
  const lastSaved = useRef("");
  const ordinaryDirty = useRef(false);
  const saveQueue = useRef(Promise.resolve());
  const conflict = useRef(false);
  const latest = useRef(data);
  latest.current = data;

  const persist = useCallback(async (snapshot: WorkspaceData) => {
    if (!revision.current || conflict.current) throw new Error("Odśwież panel przed zapisem. Brak aktualnej wersji danych.");
    const response = await fetch(`/api/workspace/${token}`, {
      method: "PUT", headers: { "Content-Type": "application/json", "If-Match": revision.current }, body: JSON.stringify(snapshot),
    });
    const json = await response.json();
    if (response.status === 409) conflict.current = true;
    if (!response.ok) throw new Error(json.error || "Nie udało się zapisać zmian.");
    revision.current = json.updated_at;
    lastSaved.current = JSON.stringify(snapshot);
  }, [token]);

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

  // Manual save and debounce share the queue and skip an already confirmed snapshot.
  const savePending = useCallback(() => {
    if (loading || fleetInFlight.current || conflict.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const snapshot = latest.current;
    saveToLocalStorage(token, snapshot);
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        if (JSON.stringify(snapshot) !== lastSaved.current) {
          setSaveStatus("saving");
          await persist(snapshot);
        }
        ordinaryDirty.current = JSON.stringify(latest.current) !== lastSaved.current;
        setSaveError("");
        setSaveStatus(ordinaryDirty.current ? "saving" : "saved");
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Nie udało się zapisać zmian.");
        setSaveStatus(conflict.current ? "conflict" : "error");
      }
    });
  }, [loading, token, persist]);

  // Autozapis z debounce 500ms po każdej zmianie danych
  useEffect(() => {
    if (!initialized.current || loading || fleetInFlight.current || conflict.current) return;
    if (!ordinaryDirty.current && JSON.stringify(data) === lastSaved.current) return;
    ordinaryDirty.current = true;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");

    saveTimer.current = setTimeout(savePending, DEBOUNCE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, loading, savePending]);

  // Both write APIs share one revision and queue. Flush ordinary edits before a payroll command.
  const saveFleet = useCallback(async (command: FleetCommand): Promise<boolean> => {
    if (fleetInFlight.current || loading) return false;
    fleetInFlight.current = true; setFleetBusy(true); setSaveError(""); setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      await saveQueue.current;
      const snapshot = latest.current;
      if (JSON.stringify(snapshot) !== lastSaved.current) {
        saveToLocalStorage(token, snapshot);
        await persist(snapshot);
      }
      if (!revision.current || conflict.current) throw new Error("Dane zmieniły się. Odśwież panel przed zapisem.");
      const response = await fetch("/api/admin/fleet", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: revision.current, command }),
      });
      const json = await response.json();
      if (response.status === 409) conflict.current = true;
      if (!response.ok) throw new Error(json.error || "Nie udało się zapisać zmiany kierowcy.");
      const confirmed = mergeWithDefaults(json.data);
      revision.current = json.updated_at;
      lastSaved.current = JSON.stringify(confirmed);
      latest.current = confirmed;
      ordinaryDirty.current = false;
      setData(confirmed); saveToLocalStorage(token, confirmed); setSaveStatus("saved");
      return true;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Nie udało się zapisać zmiany.");
      setSaveStatus(conflict.current ? "conflict" : "error");
      return false;
    } finally { fleetInFlight.current = false; setFleetBusy(false); }
  }, [loading, persist, token]);

  /** Aktualizuj dowolne pole w danych miesiąca */
  const updateMiesiac = useCallback(
    (miesiac: MiesiącId, updater: (prev: DaneMiesiaca) => DaneMiesiaca) => {
      if (fleetInFlight.current) return;
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
    if (fleetInFlight.current) return;
    setData((prev) => recalculateWorkspaceFuelChains(updater(prev)).data);
  }, []);

  /** Aktualizuj listę notatek workspace */
  const updateNotatki = useCallback(
    (updater: (prev: Notatka[]) => Notatka[]) => {
      if (fleetInFlight.current) return;
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
      if (fleetInFlight.current) return;
      setData((prev) => ({
        ...prev,
        ustawienia: { ...(prev.ustawienia ?? {}), ...patch },
      }));
    },
    []
  );

  return { data, loading, saveStatus, saveError, fleetBusy, saveFleet, savePending, updateMiesiac, updateWorkspace, updateNotatki, updateUstawienia };
}
