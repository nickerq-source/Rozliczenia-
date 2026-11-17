import { redirect } from "next/navigation";
import { getServerSupabase, getSessionProfile } from "@/lib/supabase-server";
import { FleetPanel } from "@/components/admin-preview/FleetPanel";
import type { WorkspaceData } from "@/lib/types";

export const dynamic = "force-dynamic";
export default async function FleetPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.from("workspaces").select("data, updated_at").eq("id", profile.workspace_id).single();
  if (error || !data?.data?.miesiace) return <main className="p-6"><h1>Panel niedostępny</h1><p role="alert">Nie udało się odczytać danych firmy. Niczego nie zmieniono.</p><a href="/admin">Wróć do obecnego panelu</a></main>;
  return <FleetPanel source={data.data as WorkspaceData} updatedAt={data.updated_at} />;
}
