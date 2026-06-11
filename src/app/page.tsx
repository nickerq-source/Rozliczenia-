// Strona główna — middleware kieruje: zalogowany → /dashboard, gość → /login

import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
