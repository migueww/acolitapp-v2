"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { ApiClientError, apiFetch } from "@/lib/api";

export function NewMassForm() {
  const router = useRouter();
  const [scheduledAt, setScheduledAt] = React.useState("");
  const [massType, setMassType] = React.useState("SIMPLES");
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

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
    }
  };

  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold mb-4">Nova missa</h1>
      <form onSubmit={onSubmit} className="space-y-3 max-w-md">
        <input className="border p-2 w-full" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} required />
        <select className="border p-2 w-full" value={massType} onChange={(event) => setMassType(event.target.value)}>
          <option value="SIMPLES">SIMPLES</option>
          <option value="SOLENE">SOLENE</option>
          <option value="PALAVRA">PALAVRA</option>
        </select>
        <button className="border px-3 py-2" type="submit">
          Criar
        </button>
      </form>
      {error && <p className="text-sm text-destructive mt-3">{error}</p>}
    </main>
  );
}
