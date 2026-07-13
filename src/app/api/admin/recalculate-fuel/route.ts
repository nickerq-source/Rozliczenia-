import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { getSessionProfile } from "@/lib/supabase-server";
import { recalculateWorkspaceFuelChains } from "@/lib/recalculate-fuel-chain";
import type { WorkspaceData, WpisTankowania } from "@/lib/types";

export const runtime = "nodejs";

const COMPARED_FIELDS: Array<keyof WpisTankowania> = [
  "vehicleId",
  "isFullTank",
  "previousOdometerKm",
  "kmSinceLastFuel",
  "fuelBeforeRefuelLiters",
  "costPerKmGross",
  "costPerKmNet",
  "fuelConsumptionLPer100Km",
  "fuelStatus",
  "needsReview",
  "reviewReasons",
];

function comparable(entry: WpisTankowania) {
  return Object.fromEntries(COMPARED_FIELDS.map((field) => [field, entry[field] ?? null]));
}

function allFuelEntries(data: WorkspaceData): WpisTankowania[] {
  return Object.values(data.miesiace ?? {}).flatMap((month) => month?.tankowanie ?? []);
}

export async function POST(request: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Brak sesji" }, { status: 401 });
  if (profile.role !== "admin") {
    return NextResponse.json({ error: "Tylko administrator może przeliczyć łańcuch tankowań." }, { status: 403 });
  }

  let dryRun = true;
  try {
    const body = (await request.json()) as { dryRun?: boolean };
    dryRun = body.dryRun !== false;
  } catch {
    // Brak body oznacza bezpieczny dry-run.
  }

  const admin = getAdminSupabase();
  const { data: workspace, error } = await admin
    .from("workspaces")
    .select("data")
    .eq("id", profile.workspace_id)
    .single();
  if (error || !workspace) {
    return NextResponse.json({ error: error?.message ?? "Nie znaleziono workspace." }, { status: 404 });
  }

  const before = (workspace.data ?? { miesiace: {} }) as WorkspaceData;
  const recalculation = recalculateWorkspaceFuelChains(before);
  const beforeById = new Map(allFuelEntries(before).map((entry) => [entry.id, entry]));
  const changes = allFuelEntries(recalculation.data).flatMap((entry) => {
    const previous = beforeById.get(entry.id);
    const oldValue = previous ? comparable(previous) : null;
    const newValue = comparable(entry);
    return JSON.stringify(oldValue) === JSON.stringify(newValue)
      ? []
      : [{ id: entry.id, data: entry.expenseDate ?? entry.data, oldValue, newValue }];
  });

  const report = {
    dryRun,
    workspaceId: profile.workspace_id,
    totalEntries: allFuelEntries(before).length,
    changedEntries: changes.length,
    segments: recalculation.result.segments.length,
    unassignedEntryIds: recalculation.result.unassignedEntryIds,
    changes,
  };

  if (dryRun) return NextResponse.json(report);

  const { error: saveError } = await admin
    .from("workspaces")
    .update({ data: recalculation.data, updated_at: new Date().toISOString() })
    .eq("id", profile.workspace_id);
  if (saveError) return NextResponse.json({ error: saveError.message, report }, { status: 503 });

  await admin.from("audit_log").insert({
    workspace_id: profile.workspace_id,
    user_id: profile.id,
    user_name: profile.name,
    action: "fuel_chain_recalculated",
    entity: "fuel_entries",
    entity_id: null,
    old_value: { totalEntries: report.totalEntries },
    new_value: {
      changedEntries: report.changedEntries,
      segments: report.segments,
      unassignedEntryIds: report.unassignedEntryIds,
    },
    description: `${profile.name} przeliczył wszystkie łańcuchy tankowań (${report.changedEntries} zmienionych wpisów).`,
  });

  return NextResponse.json({ ...report, applied: true });
}
