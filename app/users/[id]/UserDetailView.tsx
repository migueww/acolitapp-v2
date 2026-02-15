"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-me";
import { ApiClientError, apiFetch } from "@/lib/api";
import { formatDateTime, statusLabel } from "@/lib/mass-ui";

type UserDetail = {
  id: string;
  name: string;
  username: string;
  role: "CERIMONIARIO" | "ACOLITO";
  lastRoleKey: string | null;
  active: boolean;
  globalScore: number;
  createdAt: string;
  updatedAt: string;
};

type UserHistoryItem = {
  id: string;
  status: string;
  massType: string;
  scheduledAt: string;
  chiefBy: string;
  chiefByName: string | null;
  createdBy: string;
  createdByName: string | null;
  roleKey: string;
  confirmedAt: string | null;
};

type UserDetailResponse = {
  user: UserDetail;
  history: UserHistoryItem[];
};

type UserMutationResponse = {
  ok: true;
  user: UserDetail;
};
type LiturgyRoleItem = { key: string; label: string };
type LiturgyRolesResponse = { items: LiturgyRoleItem[] };

const NO_LAST_ROLE_KEY = "__NONE__";

const scoreValue = (raw: string): number | null => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < 0 || rounded > 100) return null;
  return rounded;
};

export function UserDetailView({ id }: { id: string }) {
  const meState = useMe();
  const router = useRouter();

  const [user, setUser] = React.useState<UserDetail | null>(null);
  const [history, setHistory] = React.useState<UserHistoryItem[]>([]);
  const [name, setName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [role, setRole] = React.useState<"CERIMONIARIO" | "ACOLITO">("ACOLITO");
  const [lastRoleKey, setLastRoleKey] = React.useState(NO_LAST_ROLE_KEY);
  const [active, setActive] = React.useState<"true" | "false">("true");
  const [globalScore, setGlobalScore] = React.useState("50");
  const [password, setPassword] = React.useState("");
  const [liturgyRoles, setLiturgyRoles] = React.useState<LiturgyRoleItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);

  const loadLiturgyRoles = React.useCallback(async () => {
    const data = await apiFetch<LiturgyRolesResponse>("/api/liturgy/roles?active=true");
    setLiturgyRoles(data.items);
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch<UserDetailResponse>(`/api/users/${id}`);
      setUser(data.user);
      setHistory(data.history);
      setName(data.user.name);
      setUsername(data.user.username);
      setRole(data.user.role);
      setLastRoleKey(data.user.lastRoleKey ?? NO_LAST_ROLE_KEY);
      setActive(data.user.active ? "true" : "false");
      setGlobalScore(String(data.user.globalScore));
      setPassword("");
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        router.replace("/login");
        return;
      }
      if (e instanceof ApiClientError && e.status === 403) {
        router.replace("/masses");
        return;
      }
      setError(e instanceof Error ? e.message : "Erro ao carregar perfil do usuario");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  React.useEffect(() => {
    if (meState.status === "loggedIn" && meState.me.role === "CERIMONIARIO") {
      void load();
      void loadLiturgyRoles();
    }
  }, [load, loadLiturgyRoles, meState]);

  const save = async () => {
    const parsedScore = scoreValue(globalScore);
    if (!name.trim() || !username.trim() || parsedScore === null) {
      setError("Nome, username/email e score entre 0 e 100 sao obrigatorios");
      return;
    }

    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      const payload: Record<string, unknown> = {
        id,
        name: name.trim(),
        username: username.trim().toLowerCase(),
        role,
        lastRoleKey: role === "ACOLITO" && lastRoleKey !== NO_LAST_ROLE_KEY ? lastRoleKey : null,
        active: active === "true",
        globalScore: parsedScore,
      };
      if (password.trim()) {
        payload.password = password;
      }

      const result = await apiFetch<UserMutationResponse>("/api/users", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      setUser(result.user);
      setPassword("");
      setInfo("Perfil atualizado com sucesso");
      await load();
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Erro ao atualizar usuario");
    } finally {
      setSaving(false);
    }
  };

  if (meState.status === "loading" || loading) {
    return (
      <main className="min-h-screen space-y-6 p-6 md:p-8">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-56" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </main>
    );
  }

  if (meState.status === "loggedOut") {
    router.replace("/login");
    return null;
  }

  if (meState.me.role !== "CERIMONIARIO") {
    router.replace("/masses");
    return null;
  }

  return (
    <AppShell
      user={meState.me}
      title="Perfil especifico"
      description="Edite o usuario selecionado e acompanhe historico de missas."
      actions={
        <Button asChild variant="outline">
          <Link href="/users">Voltar</Link>
        </Button>
      }
    >
      {error ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      {info ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-emerald-600 dark:text-emerald-400">{info}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Dados do usuario</CardTitle>
          <CardDescription>Atualize informacoes de perfil e senha do usuario.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="detail-name">Nome</Label>
              <Input id="detail-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="detail-username">Username/Email</Label>
              <Input
                id="detail-username"
                value={username}
                onChange={(event) => setUsername(event.target.value.toLowerCase())}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="detail-role">Papel</Label>
              <Select
                value={role}
                onValueChange={(value) => {
                  const nextRole = value as "CERIMONIARIO" | "ACOLITO";
                  setRole(nextRole);
                  if (nextRole === "CERIMONIARIO") {
                    setLastRoleKey(NO_LAST_ROLE_KEY);
                  }
                }}
              >
                <SelectTrigger id="detail-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CERIMONIARIO">CERIMONIARIO</SelectItem>
                  <SelectItem value="ACOLITO">ACOLITO</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {role === "ACOLITO" ? (
              <div className="space-y-2">
                <Label htmlFor="detail-last-role">Ultima funcao</Label>
                <Select value={lastRoleKey} onValueChange={setLastRoleKey}>
                  <SelectTrigger id="detail-last-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_LAST_ROLE_KEY}>Sem funcao definida</SelectItem>
                    {liturgyRoles.map((option) => (
                      <SelectItem key={option.key} value={option.key}>
                        {option.label} (#{option.key})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="detail-active">Ativo</Label>
              <Select value={active} onValueChange={(value) => setActive(value as "true" | "false")}>
                <SelectTrigger id="detail-active">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Sim</SelectItem>
                  <SelectItem value="false">Nao</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="detail-score">Score global</Label>
              <Input
                id="detail-score"
                type="number"
                min={0}
                max={100}
                value={globalScore}
                onChange={(event) => setGlobalScore(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="detail-password">Nova senha (opcional)</Label>
              <Input
                id="detail-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1 rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">ID</p>
              <p className="text-xs font-medium">{user?.id ?? "-"}</p>
            </div>
            <div className="space-y-1 rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Criado em</p>
              <p className="text-sm font-medium">{user?.createdAt ? formatDateTime(user.createdAt) : "-"}</p>
            </div>
            <div className="space-y-1 rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Atualizado em</p>
              <p className="text-sm font-medium">{user?.updatedAt ? formatDateTime(user.updatedAt) : "-"}</p>
            </div>
          </div>

          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "Salvando..." : "Salvar alteracoes"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historico de missas</CardTitle>
          <CardDescription>Missas confirmadas pelo acolito e funcao exercida.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum registro de missa encontrado para este usuario.</p>
          ) : (
            <div className="grid gap-3">
              {history.map((item) => (
                <Card key={item.id}>
                  <CardContent className="grid gap-2 pt-6">
                    <p className="text-sm font-medium">{formatDateTime(item.scheduledAt)}</p>
                    <p className="text-sm text-muted-foreground">Status: {statusLabel[item.status] ?? item.status}</p>
                    <p className="text-sm text-muted-foreground">Tipo: {item.massType}</p>
                    <p className="text-sm text-muted-foreground">Funcao na missa: {item.roleKey}</p>
                    <p className="text-sm text-muted-foreground">
                      Confirmado em: {item.confirmedAt ? formatDateTime(item.confirmedAt) : "-"}
                    </p>
                    <p className="text-sm text-muted-foreground">Responsavel: {item.chiefByName ?? item.chiefBy}</p>
                    <div className="pt-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/masses/${item.id}`}>Ver missa detalhada</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
