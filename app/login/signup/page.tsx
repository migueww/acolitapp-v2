import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupDisabledPage() {
  return (
    <div className="grid grid-rows-[0px_1fr_0px] items-center justify-items-center min-h-screen gap-16 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-2 row-start-2 items-center sm:items-start">
        <Card className="mx-auto max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Cadastro desabilitado</CardTitle>
            <CardDescription>Somente CERIMONIARIO pode criar novos usuários.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login" className="underline">
              Voltar para login
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
