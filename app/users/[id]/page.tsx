import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";

import { UserDetailView } from "./UserDetailView";

type PageProps = { params: Promise<{ id: string }> };

export default async function UserDetailPage({ params }: PageProps) {
  const auth = await getAuth();
  if (!auth) {
    redirect("/login");
  }
  if (auth.role !== "CERIMONIARIO") {
    redirect("/masses");
  }

  const { id } = await params;
  return <UserDetailView id={id} />;
}
