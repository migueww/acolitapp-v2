"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-me";
import { ApiClientError, apiFetch } from "@/lib/api";
import { resolveMassName } from "@/lib/mass-name";
import { formatDateTime, statusLabel } from "@/lib/mass-ui";

type MassListItem = {
  id: string;
  name: string;
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
  { value: "ALL", label: "Todos os status" },
  { value: "SCHEDULED", label: "Agendadas" },
  { value: "OPEN", label: "Abertas" },
  { value: "PREPARATION", label: "Em preparacao" },
  { value: "FINISHED", label: "Finalizadas" },
  { value: "CANCELED", label: "Canceladas" },
] as const;

export function MassesDashboard() {
  const meState = useMe();
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  const [status, setStatus] = React.useState("ALL");
  const [from, setFrom] = React.useState<Date | null>(null);
  const [to, setTo] = React.useState<Date | null>(null);

  const [allMasses, setAllMasses] = React.useState<MassListItem[]>([]);
  const [nextMass, setNextMass] = React.useState<MassListItem | null>(null);
  const [myHistory, setMyHistory] = React.useState<MassListItem[]>([]);

  const loadData = React.useCallback(async () => {
    setError(null);
    try {
      if (meState.status !== "loggedIn") return;

      if (meState.me.role === "CERIMONIARIO") {
        const params = new URLSearchParams();
        if (status !== "ALL") params.set("status", status);
        if (from) params.set("from", from.toISOString());
        if (to) params.set("to", to.toISOString());
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

  React.useEffect(() => {
    if (meState.status === "loggedOut") {
      router.replace("/login");
    }
  }, [meState.status, router]);

  const ceremonyStats = React.useMemo(() => {
    const byStatus = allMasses.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {});

    return {
      total: allMasses.length,
      scheduled: byStatus.SCHEDULED ?? 0,
      openAndPrep: (byStatus.OPEN ?? 0) + (byStatus.PREPARATION ?? 0),
      finished: byStatus.FINISHED ?? 0,
    };
  }, [allMasses]);

  if (meState.status === "loading") {
    return <DashboardSkeleton />;
  }

  if (meState.status === "loggedOut") {
    return null;
  }

  return (
    <AppShell
      user={meState.me}
      title="Missas"
      description="Acompanhe agenda, status e operacoes das celebracoes."
      actions={
        meState.me.role === "CERIMONIARIO" ? (
          <Button asChild>
            <Link href="/masses/new">Nova missa</Link>
          </Button>
        ) : undefined
      }
    >
      {error && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {meState.me.role === "CERIMONIARIO" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <QuickStat title="Total filtrado" value={String(ceremonyStats.total)} />
            <QuickStat title="Agendadas" value={String(ceremonyStats.scheduled)} />
            <QuickStat title="Abertas / preparacao" value={String(ceremonyStats.openAndPrep)} />
            <QuickStat title="Finalizadas" value={String(ceremonyStats.finished)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Filtros de agenda</CardTitle>
              <CardDescription>Refine por status e intervalo para encontrar rapidamente a missa certa.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="status-filter">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="status-filter">
                    <SelectValue placeholder="Todos os status" />
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
                <Label>De</Label>
                <DateTimePicker value={from} onChange={setFrom} placeholder="Inicio do intervalo" allowClear />
              </div>

              <div className="space-y-2">
                <Label>Ate</Label>
                <DateTimePicker value={to} onChange={setTo} placeholder="Fim do intervalo" allowClear />
              </div>

              <div className="flex items-end">
                <Button onClick={() => void loadData()} type="button" className="w-full">
                  Aplicar filtros
                </Button>
              </div>
            </CardContent>
          </Card>

          <MassListCard title="Resultado das missas" description="Lista organizada de acordo com os filtros selecionados." items={allMasses} />
        </div>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Proxima missa para voce</CardTitle>
              <CardDescription>Veja a celebracao prioritaria e acesse os detalhes com um toque.</CardDescription>
            </CardHeader>
            <CardContent>
              {nextMass ? (
                <MassCard item={nextMass} emphasis />
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma missa disponivel para acompanhar agora.</p>
              )}
            </CardContent>
          </Card>

          <MassListCard
            title="Historico de servico"
            description="Missas onde sua presenca ja foi confirmada."
            items={myHistory}
            emptyText="Voce ainda nao confirmou presenca em missas."
          />
        </div>
      )}
    </AppShell>
  );
}

function QuickStat({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
        <p className="text-2xl font-semibold leading-none">{value}</p>
      </CardContent>
    </Card>
  );
}

function MassListCard({
  title,
  description,
  items,
  emptyText = "Sem missas encontradas.",
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
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((item) => (
              <MassCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MassCard({ item, emphasis = false }: { item: MassListItem; emphasis?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${emphasis ? "bg-muted/20" : "bg-background"}`}>
      <p className="text-sm font-semibold">{resolveMassName(item.name, item.scheduledAt)}</p>
      <p className="text-xs text-muted-foreground">
        {formatDateTime(item.scheduledAt)} - {statusLabel[item.status] ?? item.status} - {item.massType}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Responsavel: {userLabel(item.chiefByName, item.chiefBy)}</p>
      <p className="text-xs text-muted-foreground">Criado por: {userLabel(item.createdByName, item.createdBy)}</p>
      <div className="mt-3">
        <Button asChild variant="outline" size="sm">
          <Link href={`/masses/${item.id}`}>Ver detalhe</Link>
        </Button>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <main className="min-h-screen space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-80" />
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
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    </main>
  );
}
