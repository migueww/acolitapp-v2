import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";

export default async function MassesPage() {
  const auth = await getAuth();

  if (!auth) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen p-8 font-[family-name:var(--font-geist-sans)]">
      <h1 className="text-2xl font-semibold">Tela inicial</h1>
      <p className="mt-2">Usuário autenticado com sucesso.</p>
      <p className="mt-1">Perfil: {auth.role}</p>
    </main>
  );
}
