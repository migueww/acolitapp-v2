import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";

import { DashboardHome } from "./DashboardHome";

export default async function DashboardPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");

  return <DashboardHome />;
}
