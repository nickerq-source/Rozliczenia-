import { redirect } from "next/navigation";
import { getServerSupabase, getSessionProfile } from "@/lib/supabase-server";
import { AdminPreview } from "@/components/admin-preview/AdminPreview";
import type { WorkspaceData } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPreviewPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");

  // Session-scoped SELECT: RLS remains active. No service role, API writes or autosave.
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.from("workspaces")
    .select("data, updated_at").eq("id", profile.workspace_id).single();
  if (error || !data?.data || typeof data.data !== "object" || !data.data.miesiace) {
    return <main className="max-w-xl mx-auto p-6">
      <h1 className="text-xl mb-4">Podgląd niedostępny</h1>
      <p role="alert">Nie udało się odczytać danych firmy. Nie zastąpiono ich pustymi kwotami.</p>
      <a className="inline-block mt-6 underline text-amber-brand" href="/admin">Wróć do obecnego panelu</a>
    </main>;
  }
  return <AdminPreview source={data.data as WorkspaceData} updatedAt={data.updated_at ?? null} />;
}
