import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";

import { LiturgyManagement } from "./LiturgyManagement";

export default async function LiturgyPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (auth.role !== "CERIMONIARIO") redirect("/masses");

  return <LiturgyManagement />;
}
