import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";

import { NewMassForm } from "./NewMassForm";

export default async function NewMassPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (auth.role !== "CERIMONIARIO") redirect("/masses");

  return <NewMassForm />;
}
