// Rozjazd po zalogowaniu: admin → /admin, driver → /driver

import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const profile = await getSessionProfile();

  if (!profile) redirect("/login");
  if (profile.role === "driver") redirect("/driver");
  redirect("/admin");
}
