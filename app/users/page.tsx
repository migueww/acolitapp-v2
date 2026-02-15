import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";

import { UsersManagement } from "./UsersManagement";

export default async function UsersPage() {
  const auth = await getAuth();
  if (!auth) {
    redirect("/login");
  }
  if (auth.role !== "CERIMONIARIO") {
    redirect("/masses");
  }

  return <UsersManagement />;
}
