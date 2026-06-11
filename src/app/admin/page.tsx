// Panel admina — pełna aplikacja (WorkspaceView) na workspace z profilu

import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase-server";
import { WorkspaceView } from "@/components/WorkspaceView";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const profile = await getSessionProfile();

  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/driver");

  return (
    <WorkspaceView
      token={profile.workspace_id}
      initialUserName={profile.name}
      isAdmin
    />
  );
}
