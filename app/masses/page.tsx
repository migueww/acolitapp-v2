import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";

import { MassesDashboard } from "./MassesDashboard";

export default async function MassesPage() {
  const auth = await getAuth();
  if (!auth) {
    redirect("/login");
  }

  return <MassesDashboard />;
}
