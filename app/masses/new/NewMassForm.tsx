"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { ApiClientError, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoutButton } from "@/components/logout-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function NewMassForm() {
  const router = useRouter();
  const [scheduledAt, setScheduledAt] = React.useState("");
  const [massType, setMassType] = React.useState("SIMPLES");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const data = await apiFetch<{ massId: string }>("/api/masses", {
        method: "POST",
        body: JSON.stringify({ scheduledAt, massType }),
      });
      router.replace(`/masses/${data.massId}`);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Erro ao criar missa");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen p-6 md:p-8">
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Nova missa</CardTitle>
            <LogoutButton />
          </div>
          <CardDescription>Defina data e tipo da celebracao para iniciar o planejamento.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="scheduledAt">Data e horario</Label>
              <Input
                id="scheduledAt"
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="massType">Tipo da missa</Label>
              <Select value={massType} onValueChange={setMassType}>
                <SelectTrigger id="massType">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SIMPLES">SIMPLES</SelectItem>
                  <SelectItem value="SOLENE">SOLENE</SelectItem>
                  <SelectItem value="PALAVRA">PALAVRA</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Criando..." : "Criar missa"}
            </Button>
          </form>

          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
