"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useMe } from "@/hooks/use-me";
import { ApiClientError, apiFetch } from "@/lib/api";
import { formatDateTime, statusLabel } from "@/lib/mass-ui";

type MassListItem = { id: string; status: string; massType: string; scheduledAt: string; chiefBy: string; createdBy: string };

type ListResponse = { items: MassListItem[] };
type NextResponse = { item: MassListItem | null };

export function MassesDashboard() {
  const meState = useMe();
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  const [status, setStatus] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const [allMasses, setAllMasses] = React.useState<MassListItem[]>([]);
  const [nextMass, setNextMass] = React.useState<MassListItem | null>(null);
  const [myHistory, setMyHistory] = React.useState<MassListItem[]>([]);

  const loadData = React.useCallback(async () => {
    setError(null);
    try {
      if (meState.status !== "loggedIn") return;

      if (meState.me.role === "CERIMONIARIO") {
        const params = new URLSearchParams();
        if (status) params.set("status", status);
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
    return <main className="p-8">Carregando...</main>;
  }

  if (meState.status === "loggedOut") {
    router.replace("/login");
    return null;
  }

  return (
    <main className="min-h-screen p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Missas</h1>
        {meState.me.role === "CERIMONIARIO" && (
          <Link className="underline" href="/masses/new">
            Nova missa
          </Link>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {meState.me.role === "CERIMONIARIO" ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Todas as missas</h2>
          <div className="flex gap-2 flex-wrap">
            <select className="border p-2" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todos status</option>
              <option value="SCHEDULED">SCHEDULED</option>
              <option value="OPEN">OPEN</option>
              <option value="PREPARATION">PREPARATION</option>
              <option value="FINISHED">FINISHED</option>
              <option value="CANCELED">CANCELED</option>
            </select>
            <input className="border p-2" type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} />
            <input className="border p-2" type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} />
            <button className="border px-3" onClick={() => void loadData()} type="button">
              Filtrar
            </button>
          </div>
          <MassList items={allMasses} />
        </section>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-medium">Próxima missa</h2>
            <MassList items={nextMass ? [nextMass] : []} emptyText="Nenhuma missa disponível" />
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-medium">Meu histórico (confirmadas)</h2>
            <MassList items={myHistory} emptyText="Você ainda não confirmou presença em missas" />
          </section>
        </>
      )}
    </main>
  );
}

function MassList({ items, emptyText = "Sem missas" }: { items: MassListItem[]; emptyText?: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="border rounded p-3">
          <p>{formatDateTime(item.scheduledAt)}</p>
          <p>Status: {statusLabel[item.status] ?? item.status}</p>
          <p>Tipo: {item.massType}</p>
          <Link className="underline" href={`/masses/${item.id}`}>
            Ver detalhe
          </Link>
        </li>
      ))}
    </ul>
  );
}
