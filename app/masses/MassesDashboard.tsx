"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useMe } from "@/hooks/use-me";
import { ApiClientError, apiFetch } from "@/lib/api";
import { formatDateTime, statusLabel } from "@/lib/mass-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoutButton } from "@/components/logout-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type MassListItem = {
  id: string;
  status: string;
  massType: string;
  scheduledAt: string;
  chiefBy: string;
  chiefByName: string | null;
  createdBy: string;
  createdByName: string | null;
};

type ListResponse = { items: MassListItem[] };
type NextResponse = { item: MassListItem | null };

const SHORT_ID_HEAD = 6;
const SHORT_ID_TAIL = 4;

const shortenId = (id: string): string => `${id.slice(0, SHORT_ID_HEAD)}...${id.slice(-SHORT_ID_TAIL)}`;
const userLabel = (name: string | null, id: string): string => name ?? `Usuario nao encontrado (${shortenId(id)})`;

const statusOptions = [
  { value: "ALL", label: "Todos status" },
  { value: "SCHEDULED", label: "SCHEDULED" },
  { value: "OPEN", label: "OPEN" },
  { value: "PREPARATION", label: "PREPARATION" },
  { value: "FINISHED", label: "FINISHED" },
  { value: "CANCELED", label: "CANCELED" },
] as const;

export function MassesDashboard() {
  const meState = useMe();
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  const [status, setStatus] = React.useState("ALL");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const [allMasses, setAllMasses] = React.useState<MassListItem[]>([]);
  const [nextMass, setNextMass] = React.useState<MassListItem | null>(null);
  const [myHistory, setMyHistory] = React.useState<MassListItem[]>([]);

  const loadData = React.useCallback(async () => {
    setError(null);
    try {
      if (meState.status !== "loggedIn") {
        return;
      }

      if (meState.me.role === "CERIMONIARIO") {
        const params = new URLSearchParams();
        if (status !== "ALL") params.set("status", status);
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const query = params.toString();
        const data = await apiFetch<ListResponse>(`/api/masses${query ? `?${query}` : ""}`);
        setAllMasses(data.items);
        return;
      }

      const [nextData, mineData] = await Promise.all([
        apiFetch<NextResponse>("/api/masses/next"),
        apiFetch<ListResponse>("/api/masses/mine"),
      ]);
      setNextMass(nextData.item);
      setMyHistory(mineData.items);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Erro ao carregar missas");
    }
  }, [from, meState, router, status, to]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  if (meState.status === "loading") {
    return <DashboardSkeleton />;
  }

  if (meState.status === "loggedOut") {
    router.replace("/login");
    return null;
  }

  return (
    <main className="min-h-screen space-y-6 p-6 md:p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Missas</h1>
          <p className="text-sm text-muted-foreground">Gerencie celebracoes e acompanhe os detalhes da escala.</p>
        </div>

        <div className="flex items-center gap-2">
          {meState.me.role === "CERIMONIARIO" && (
            <Button asChild>
              <Link href="/masses/new">Nova missa</Link>
            </Button>
          )}
          <LogoutButton />
        </div>
      </header>

      {error && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {meState.me.role === "CERIMONIARIO" ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
              <CardDescription>Refine a listagem por status e janela de horario.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="status-filter">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="status-filter">
                    <SelectValue placeholder="Todos status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="from-filter">De</Label>
                <Input
                  id="from-filter"
                  type="datetime-local"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="to-filter">Ate</Label>
                <Input
                  id="to-filter"
                  type="datetime-local"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                />
              </div>

              <div className="flex items-end">
                <Button onClick={() => void loadData()} type="button" className="w-full">
                  Aplicar filtros
                </Button>
              </div>
            </CardContent>
          </Card>

          <MassListCard
            title="Todas as missas"
            description="Lista completa de celebracoes de acordo com os filtros."
            items={allMasses}
          />
        </>
      ) : (
        <div className="grid gap-6">
          <MassListCard
            title="Proxima missa"
            description="Celebracao prioritaria para acompanhamento."
            items={nextMass ? [nextMass] : []}
            emptyText="Nenhuma missa disponivel"
          />
          <MassListCard
            title="Meu historico (confirmadas)"
            description="Missas em que voce confirmou presenca."
            items={myHistory}
            emptyText="Voce ainda nao confirmou presenca em missas"
          />
        </div>
      )}
    </main>
  );
}

function MassListCard({
  title,
  description,
  items,
  emptyText = "Sem missas",
}: {
  title: string;
  description: string;
  items: MassListItem[];
  emptyText?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => (
              <Card key={item.id}>
                <CardContent className="grid gap-2 pt-6">
                  <p className="text-sm font-medium">{formatDateTime(item.scheduledAt)}</p>
                  <p className="text-sm text-muted-foreground">Status: {statusLabel[item.status] ?? item.status}</p>
                  <p className="text-sm text-muted-foreground">Tipo: {item.massType}</p>
                  <p className="text-sm text-muted-foreground">
                    Responsavel: {userLabel(item.chiefByName, item.chiefBy)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Criado por: {userLabel(item.createdByName, item.createdBy)}
                  </p>

                  <div className="pt-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/masses/${item.id}`}>Ver detalhe</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <main className="min-h-screen space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-48" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </CardContent>
      </Card>
    </main>
  );
}
