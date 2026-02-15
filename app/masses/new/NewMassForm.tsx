"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ApiClientError, apiFetch } from "@/lib/api";
import { useMe } from "@/hooks/use-me";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type LiturgyMassTypeOption = { key: string; label: string; active: boolean; roleKeys: string[] };
type LiturgyMassTypesResponse = { items: LiturgyMassTypeOption[] };

const getDefaultScheduledAt = (): Date => {
  const value = new Date();
  value.setHours(value.getHours() + 1);
  value.setSeconds(0);
  value.setMilliseconds(0);
  return value;
};

export function NewMassForm() {
  const router = useRouter();
  const meState = useMe();
  const [name, setName] = React.useState("");
  const [scheduledAt, setScheduledAt] = React.useState<Date | null>(() => getDefaultScheduledAt());
  const [massType, setMassType] = React.useState("");
  const [massTypeOptions, setMassTypeOptions] = React.useState<LiturgyMassTypeOption[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (meState.status !== "loggedIn") return;
    let active = true;

    apiFetch<LiturgyMassTypesResponse>("/api/liturgy/mass-types?active=true")
      .then((response) => {
        if (!active) return;
        setMassTypeOptions(response.items);
        setMassType((current) => current || response.items[0]?.key || "");
      })
      .catch((e) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Erro ao carregar tipos de missa");
      });

    return () => {
      active = false;
    };
  }, [meState.status]);

  React.useEffect(() => {
    if (meState.status === "loggedOut") {
      router.replace("/login");
    }
  }, [meState.status, router]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const data = await apiFetch<{ massId: string }>("/api/masses", {
        method: "POST",
        body: JSON.stringify({ name, scheduledAt: (scheduledAt ?? getDefaultScheduledAt()).toISOString(), massType }),
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

  if (meState.status === "loading") {
    return (
      <main className="min-h-screen space-y-6 p-6 md:p-8">
        <Skeleton className="h-8 w-56" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-36" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </main>
    );
  }

  if (meState.status === "loggedOut") {
    return null;
  }

  return (
    <AppShell user={meState.me} title="Nova missa" description="Defina data e tipo para iniciar o planejamento.">
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle>Cadastro da missa</CardTitle>
          <CardDescription>Preencha os dados da celebracao.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da missa (opcional)</Label>
              <Input
                id="name"
                value={name}
                maxLength={80}
                placeholder="Ex.: Missa de abertura da quaresma"
                onChange={(event) => setName(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">Se ficar vazio, o sistema usa dia da semana e horario.</p>
            </div>

            <div className="space-y-2">
              <Label>Data e horario</Label>
              <DateTimePicker
                value={scheduledAt}
                onChange={setScheduledAt}
                placeholder="Selecionar data e horario"
                allowClear
              />
              <p className="text-xs text-muted-foreground">Se ficar vazio, usaremos automaticamente 1h a partir de agora.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="massType">Tipo da missa</Label>
              <Select value={massType} onValueChange={setMassType}>
                <SelectTrigger id="massType">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {massTypeOptions.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full" disabled={submitting || !massType}>
              {submitting ? "Criando..." : "Criar missa"}
            </Button>
          </form>

          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </AppShell>
  );
}
