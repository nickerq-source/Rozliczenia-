// Panel logistyka — tylko jego rozliczenie (dane przez server API, bez reszty firmy).

import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase-server";
import { LogistykView } from "@/components/LogistykView";

export const dynamic = "force-dynamic";

export default async function LogistykPage() {
  const profile = await getSessionProfile();

  if (!profile) redirect("/login");
  if (profile.role !== "logistyk") redirect("/dashboard");

  return <LogistykView name={profile.name} />;
}
