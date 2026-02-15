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

type UserListItem = {
  id: string;
  name: string;
  username: string;
  role: "CERIMONIARIO" | "ACOLITO";
  lastRoleKey: string | null;
  active: boolean;
  globalScore: number;
};

type UserDraft = {
  id: string;
  name: string;
  username: string;
  role: "CERIMONIARIO" | "ACOLITO";
  lastRoleKey: string;
  active: "true" | "false";
  globalScore: string;
  password: string;
};

type UserListResponse = { items: UserListItem[] };
type UserMutationResponse = { ok: true; user: UserListItem };
type LiturgyRoleItem = { key: string; label: string };
type LiturgyRolesResponse = { items: LiturgyRoleItem[] };

const NO_LAST_ROLE_KEY = "__NONE__";

const userRoleOptions = [
  { value: "ALL", label: "Todos papeis" },
  { value: "CERIMONIARIO", label: "CERIMONIARIO" },
  { value: "ACOLITO", label: "ACOLITO" },
] as const;

const activeOptions = [
  { value: "ALL", label: "Todos" },
  { value: "true", label: "Ativos" },
  { value: "false", label: "Inativos" },
] as const;

const scoreValue = (raw: string): number | null => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < 0 || rounded > 100) return null;
  return rounded;
};

export function UsersManagement() {
  const meState = useMe();
  const router = useRouter();

  const [users, setUsers] = React.useState<UserListItem[]>([]);
  const [draftsById, setDraftsById] = React.useState<Record<string, UserDraft>>({});
  const [userRoleFilter, setUserRoleFilter] = React.useState("ALL");
  const [userActiveFilter, setUserActiveFilter] = React.useState("ALL");
  const [userQuery, setUserQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [creatingUser, setCreatingUser] = React.useState(false);
  const [savingUserId, setSavingUserId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [liturgyRoles, setLiturgyRoles] = React.useState<LiturgyRoleItem[]>([]);

  const [newUserName, setNewUserName] = React.useState("");
  const [newUserUsername, setNewUserUsername] = React.useState("");
  const [newUserPassword, setNewUserPassword] = React.useState("");
  const [newUserRole, setNewUserRole] = React.useState<"CERIMONIARIO" | "ACOLITO">("ACOLITO");
  const [newUserLastRoleKey, setNewUserLastRoleKey] = React.useState(NO_LAST_ROLE_KEY);
  const [newUserScore, setNewUserScore] = React.useState("50");

  const loadLiturgyRoles = React.useCallback(async () => {
    const data = await apiFetch<LiturgyRolesResponse>("/api/liturgy/roles?active=true");
    setLiturgyRoles(data.items);
  }, []);

  const loadUsers = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (userRoleFilter !== "ALL") params.set("role", userRoleFilter);
      if (userActiveFilter !== "ALL") params.set("active", userActiveFilter);
      if (userQuery.trim()) params.set("q", userQuery.trim());
      const query = params.toString();

      const data = await apiFetch<UserListResponse>(`/api/users${query ? `?${query}` : ""}`);
      setUsers(data.items);
      setDraftsById(
        Object.fromEntries(
          data.items.map((user) => [
            user.id,
            {
              id: user.id,
              name: user.name,
              username: user.username,
              role: user.role,
              lastRoleKey: user.lastRoleKey ?? NO_LAST_ROLE_KEY,
              active: user.active ? "true" : "false",
              globalScore: String(user.globalScore),
              password: "",
            },
          ])
        )
      );
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Erro ao carregar usuarios");
    } finally {
      setLoading(false);
    }
  }, [router, userActiveFilter, userRoleFilter, userQuery]);

  React.useEffect(() => {
    if (meState.status === "loggedIn" && meState.me.role === "CERIMONIARIO") {
      void loadUsers();
      void loadLiturgyRoles();
    }
  }, [loadLiturgyRoles, loadUsers, meState]);

  const createUser = async () => {
    const globalScore = scoreValue(newUserScore);
    if (!newUserName.trim() || !newUserUsername.trim() || !newUserPassword || globalScore === null) {
      setError("Preencha nome, username/email, senha e score valido entre 0 e 100");
      return;
    }

    setCreatingUser(true);
    setError(null);
    setInfo(null);
    try {
      await apiFetch<UserMutationResponse>("/api/users", {
        method: "POST",
        body: JSON.stringify({
          name: newUserName.trim(),
          username: newUserUsername.trim().toLowerCase(),
          password: newUserPassword,
          role: newUserRole,
          lastRoleKey: newUserRole === "ACOLITO" && newUserLastRoleKey !== NO_LAST_ROLE_KEY ? newUserLastRoleKey : null,
          globalScore,
        }),
      });

      setNewUserName("");
      setNewUserUsername("");
      setNewUserPassword("");
      setNewUserRole("ACOLITO");
      setNewUserLastRoleKey(NO_LAST_ROLE_KEY);
      setNewUserScore("50");
      setInfo("Usuario criado com sucesso");
      await loadUsers();
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Erro ao criar usuario");
    } finally {
      setCreatingUser(false);
    }
  };

  const saveUser = async (userId: string) => {
    const draft = draftsById[userId];
    if (!draft) return;

    const globalScore = scoreValue(draft.globalScore);
    if (!draft.name.trim() || !draft.username.trim() || globalScore === null) {
      setError("Nome, username/email e score entre 0 e 100 sao obrigatorios");
      return;
    }

    setSavingUserId(userId);
    setError(null);
    setInfo(null);
    try {
      const payload: Record<string, unknown> = {
        id: userId,
        name: draft.name.trim(),
        username: draft.username.trim().toLowerCase(),
        role: draft.role,
        lastRoleKey: draft.role === "ACOLITO" && draft.lastRoleKey !== NO_LAST_ROLE_KEY ? draft.lastRoleKey : null,
        active: draft.active === "true",
        globalScore,
      };

      if (draft.password.trim()) {
        payload.password = draft.password;
      }

      await apiFetch<UserMutationResponse>("/api/users", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setInfo("Usuario atualizado com sucesso");
      await loadUsers();
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Erro ao atualizar usuario");
    } finally {
      setSavingUserId(null);
    }
  };

  const updateDraft = (userId: string, patch: Partial<UserDraft>) => {
    setDraftsById((prev) => {
      const current = prev[userId];
      if (!current) return prev;
      return { ...prev, [userId]: { ...current, ...patch } };
    });
  };

  if (meState.status === "loading" || loading) {
    return (
      <main className="min-h-screen space-y-6 p-6 md:p-8">
        <Skeleton className="h-8 w-56" />
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
    <AppShell user={meState.me} title="Gerenciamento de usuarios" description="Crie, edite e administre contas.">
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
          <CardTitle>Criar usuario</CardTitle>
          <CardDescription>Username/email deve ser unico no sistema.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-6">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="new-user-name">Nome</Label>
            <Input id="new-user-name" value={newUserName} onChange={(event) => setNewUserName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-user-username">Username/Email</Label>
            <Input
              id="new-user-username"
              value={newUserUsername}
              onChange={(event) => setNewUserUsername(event.target.value.toLowerCase())}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-user-password">Senha inicial</Label>
            <Input
              id="new-user-password"
              type="password"
              value={newUserPassword}
              onChange={(event) => setNewUserPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-user-role">Papel</Label>
            <Select
              value={newUserRole}
              onValueChange={(value) => {
                const nextRole = value as "CERIMONIARIO" | "ACOLITO";
                setNewUserRole(nextRole);
                if (nextRole === "CERIMONIARIO") {
                  setNewUserLastRoleKey(NO_LAST_ROLE_KEY);
                }
              }}
            >
              <SelectTrigger id="new-user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CERIMONIARIO">CERIMONIARIO</SelectItem>
                <SelectItem value="ACOLITO">ACOLITO</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {newUserRole === "ACOLITO" ? (
            <div className="space-y-2">
              <Label htmlFor="new-user-last-role">Ultima funcao</Label>
              <Select value={newUserLastRoleKey} onValueChange={setNewUserLastRoleKey}>
                <SelectTrigger id="new-user-last-role">
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
          <div className="space-y-2">
            <Label htmlFor="new-user-score">Score</Label>
            <Input
              id="new-user-score"
              type="number"
              min={0}
              max={100}
              value={newUserScore}
              onChange={(event) => setNewUserScore(event.target.value)}
            />
          </div>
        </CardContent>
        <CardContent>
          <div className="flex justify-end">
            <Button type="button" onClick={() => void createUser()} disabled={creatingUser}>
              {creatingUser ? "Criando..." : "Criar usuario"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios cadastrados</CardTitle>
          <CardDescription>Atualize dados, score e senha dos acolitos e cerimoniarios.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="users-search-filter">Buscar</Label>
              <Input
                id="users-search-filter"
                placeholder="Nome ou username"
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="users-role-filter">Filtrar papel</Label>
              <Select value={userRoleFilter} onValueChange={setUserRoleFilter}>
                <SelectTrigger id="users-role-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {userRoleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="users-active-filter">Filtrar status</Label>
              <Select value={userActiveFilter} onValueChange={setUserActiveFilter}>
                <SelectTrigger id="users-active-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="button" className="w-full" variant="outline" onClick={() => void loadUsers()}>
                Atualizar lista
              </Button>
            </div>
          </div>

          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum usuario encontrado para o filtro atual.</p>
          ) : (
            <div className="grid gap-3">
              {users.map((user) => {
                const draft = draftsById[user.id];
                if (!draft) return null;

                return (
                  <Card key={user.id}>
                    <CardContent className="space-y-3 pt-6">
                      <div className="grid gap-3 md:grid-cols-8">
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor={`name-${user.id}`}>Nome</Label>
                          <Input
                            id={`name-${user.id}`}
                            value={draft.name}
                            onChange={(event) => updateDraft(user.id, { name: event.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`username-${user.id}`}>Username/Email</Label>
                          <Input
                            id={`username-${user.id}`}
                            value={draft.username}
                            onChange={(event) => updateDraft(user.id, { username: event.target.value.toLowerCase() })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`role-${user.id}`}>Papel</Label>
                          <Select
                            value={draft.role}
                            onValueChange={(value) => {
                              const nextRole = value as "CERIMONIARIO" | "ACOLITO";
                              updateDraft(user.id, {
                                role: nextRole,
                                ...(nextRole === "CERIMONIARIO" ? { lastRoleKey: NO_LAST_ROLE_KEY } : {}),
                              });
                            }}
                          >
                            <SelectTrigger id={`role-${user.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CERIMONIARIO">CERIMONIARIO</SelectItem>
                              <SelectItem value="ACOLITO">ACOLITO</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {draft.role === "ACOLITO" ? (
                          <div className="space-y-2">
                            <Label htmlFor={`last-role-${user.id}`}>Ultima funcao</Label>
                            <Select
                              value={draft.lastRoleKey}
                              onValueChange={(value) => updateDraft(user.id, { lastRoleKey: value })}
                            >
                              <SelectTrigger id={`last-role-${user.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NO_LAST_ROLE_KEY}>Sem funcao definida</SelectItem>
                                {liturgyRoles.map((option) => (
                                  <SelectItem key={`${user.id}-${option.key}`} value={option.key}>
                                    {option.label} (#{option.key})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : null}
                        <div className="space-y-2">
                          <Label htmlFor={`active-${user.id}`}>Ativo</Label>
                          <Select
                            value={draft.active}
                            onValueChange={(value) => updateDraft(user.id, { active: value as "true" | "false" })}
                          >
                            <SelectTrigger id={`active-${user.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">Sim</SelectItem>
                              <SelectItem value="false">Nao</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`score-${user.id}`}>Score</Label>
                          <Input
                            id={`score-${user.id}`}
                            type="number"
                            min={0}
                            max={100}
                            value={draft.globalScore}
                            onChange={(event) => updateDraft(user.id, { globalScore: event.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`password-${user.id}`}>Nova senha (opcional)</Label>
                          <Input
                            id={`password-${user.id}`}
                            type="password"
                            value={draft.password}
                            onChange={(event) => updateDraft(user.id, { password: event.target.value })}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">ID: {user.id}</p>
                        <div className="flex gap-2">
                          <Button asChild variant="outline">
                            <Link href={`/users/${user.id}`}>Ver perfil</Link>
                          </Button>
                          <Button
                            type="button"
                            onClick={() => void saveUser(user.id)}
                            disabled={savingUserId === user.id}
                          >
                            {savingUserId === user.id ? "Salvando..." : "Salvar"}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
