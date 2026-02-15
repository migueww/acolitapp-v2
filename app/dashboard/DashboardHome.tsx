"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-me";
import { ApiClientError, apiFetch } from "@/lib/api";
import { resolveMassName } from "@/lib/mass-name";
import { formatDateTime, statusLabel } from "@/lib/mass-ui";

type DashboardMass = {
  id: string;
  name: string;
  status: string;
  massType: string;
  scheduledAt: string;
  createdBy: string;
  chiefBy: string;
  createdByName: string | null;
  chiefByName: string | null;
};

type DashboardResponse = {
  upcomingMasses: DashboardMass[];
  lastServed: DashboardMass | null;
  ranking: Array<{ userId: string; userName: string | null; participations: number }>;
  stats: {
    activeUsers: number;
    activeAcolitos: number;
    activeCerimoniarios: number;
  };
};

const SHORT_ID_HEAD = 6;
const SHORT_ID_TAIL = 4;
const shortenId = (id: string): string => `${id.slice(0, SHORT_ID_HEAD)}...${id.slice(-SHORT_ID_TAIL)}`;
const userLabel = (name: string | null, id: string): string => name ?? `Usuario nao encontrado (${shortenId(id)})`;

export function DashboardHome() {
  const meState = useMe();
  const router = useRouter();
  const [data, setData] = React.useState<DashboardResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    if (meState.status !== "loggedIn") return;

    setError(null);
    try {
      const result = await apiFetch<DashboardResponse>("/api/dashboard/overview");
      setData(result);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Erro ao carregar dashboard");
    }
  }, [meState.status, router]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  React.useEffect(() => {
    if (meState.status === "loggedOut") {
      router.replace("/login");
    }
  }, [meState.status, router]);

  if (meState.status === "loading" || !data) {
    return <DashboardSkeleton />;
  }

  if (meState.status === "loggedOut") {
    return null;
  }

  return (
    <AppShell
      user={meState.me}
      title="Dashboard"
      description="Visao geral do sistema e das celebracoes."
      actions={
        <Button asChild variant="outline">
          <Link href="/masses">Abrir missas</Link>
        </Button>
      }
    >
      {error && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Usuarios ativos" value={String(data.stats.activeUsers)} helper="Contas habilitadas no sistema." />
        <StatCard title="Acolitos ativos" value={String(data.stats.activeAcolitos)} helper="Participantes aptos a servir." />
        <StatCard title="Cerimoniarios ativos" value={String(data.stats.activeCerimoniarios)} helper="Equipe com acesso administrativo." />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>3 proximas missas</CardTitle>
            <CardDescription>Agenda prioritaria para organizacao imediata.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.upcomingMasses.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma missa futura encontrada.</p>
            ) : (
              <div className="space-y-3">
                {data.upcomingMasses.map((mass) => (
                  <MassOverviewItem key={mass.id} mass={mass} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{meState.me.role === "CERIMONIARIO" ? "Ultima missa gerida" : "Ultima missa servida"}</CardTitle>
            <CardDescription>Ultimo registro relevante para seu perfil.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.lastServed ? (
              <MassOverviewItem mass={data.lastServed} />
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum registro encontrado.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ranking de participacao</CardTitle>
          <CardDescription>Usuarios que mais participaram de missas finalizadas.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem participacoes registradas ainda.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {data.ranking.map((item, index) => (
                <div key={item.userId} className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">#{index + 1}</p>
                  <p className="text-sm font-semibold">{userLabel(item.userName, item.userId)}</p>
                  <p className="text-xs text-muted-foreground">{item.participations} participacoes</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

function StatCard({ title, value, helper }: { title: string; value: string; helper: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
        <p className="text-2xl font-semibold leading-none">{value}</p>
        <p className="text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

function MassOverviewItem({ mass }: { mass: DashboardMass }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-sm font-semibold">{resolveMassName(mass.name, mass.scheduledAt)}</p>
      <p className="text-xs text-muted-foreground">
        {formatDateTime(mass.scheduledAt)} - {statusLabel[mass.status] ?? mass.status} - {mass.massType}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Responsavel: {userLabel(mass.chiefByName, mass.chiefBy)}</p>
      <div className="mt-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/masses/${mass.id}`}>Ver missa</Link>
        </Button>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <main className="min-h-screen space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
      <Skeleton className="h-56 w-full" />
    </main>
  );
}
