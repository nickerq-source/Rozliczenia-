// Panel kierowcy — tylko widok wypłaty (dane przez server API, RLS blokuje resztę)

import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase-server";
import { DriverView } from "@/components/DriverView";

export const dynamic = "force-dynamic";

export default async function DriverPage() {
  const profile = await getSessionProfile();

  if (!profile) redirect("/login");
  if (profile.role !== "driver") redirect("/admin");

  return <DriverView name={profile.name} />;
}
