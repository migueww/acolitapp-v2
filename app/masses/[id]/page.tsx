import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";

import { MassDetail } from "./MassDetail";

type PageProps = { params: Promise<{ id: string }> };

export default async function MassDetailPage({ params }: PageProps) {
  const auth = await getAuth();
  if (!auth) redirect("/login");

  const { id } = await params;
  return <MassDetail id={id} />;
}
