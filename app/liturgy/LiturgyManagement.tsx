"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-me";
import { ApiClientError, apiFetch } from "@/lib/api";

type LiturgyRole = { key: string; label: string; description: string; score: number; active: boolean };
type LiturgyMassType = {
  key: string;
  label: string;
  roleKeys: string[];
  fallbackRoleKey: string | null;
  active: boolean;
};
type LiturgyRolesResponse = { items: LiturgyRole[] };
type LiturgyMassTypesResponse = { items: LiturgyMassType[] };

const dedupeByKey = <T extends { key: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    deduped.push(item);
  }
  return deduped;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const toUiErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) {
    const message = error.message?.trim();
    if (!message || message === "[object Event]") return fallback;
    return message;
  }
  return fallback;
};

export function LiturgyManagement() {
  const meState = useMe();
  const router = useRouter();

  const [roles, setRoles] = React.useState<LiturgyRole[]>([]);
  const [massTypes, setMassTypes] = React.useState<LiturgyMassType[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);

  const [newRole, setNewRole] = React.useState({ label: "", description: "", score: "0", active: "true" as "true" | "false" });
  const [newMassType, setNewMassType] = React.useState({
    label: "",
    roleKeys: [] as string[],
    fallbackRoleKey: "",
    active: "true" as "true" | "false",
  });

  const [savingRoleKey, setSavingRoleKey] = React.useState<string | null>(null);
  const [savingMassTypeKey, setSavingMassTypeKey] = React.useState<string | null>(null);
  const [creatingRole, setCreatingRole] = React.useState(false);
  const [creatingMassType, setCreatingMassType] = React.useState(false);

  const [roleDrafts, setRoleDrafts] = React.useState<Record<string, LiturgyRole>>({});
  const [massTypeDrafts, setMassTypeDrafts] = React.useState<Record<string, LiturgyMassType>>({});

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchData = async () => {
        const [rolesData, massTypesData] = await Promise.all([
          apiFetch<LiturgyRolesResponse>("/api/liturgy/roles"),
          apiFetch<LiturgyMassTypesResponse>("/api/liturgy/mass-types"),
        ]);
        return {
          roles: rolesData.items,
          massTypes: massTypesData.items,
        };
      };

      let data;
      try {
        data = await fetchData();
      } catch {
        await sleep(250);
        data = await fetchData();
      }

      const dedupedRoles = dedupeByKey(data.roles);
      const dedupedMassTypes = dedupeByKey(data.massTypes);
      setRoles(dedupedRoles);
      setMassTypes(dedupedMassTypes);
      setRoleDrafts(Object.fromEntries(dedupedRoles.map((item) => [item.key, item])));
      setMassTypeDrafts(Object.fromEntries(dedupedMassTypes.map((item) => [item.key, item])));
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setError(toUiErrorMessage(e, "Erro ao carregar configuracao de liturgia"));
    } finally {
      setLoading(false);
    }
  }, [router]);

  React.useEffect(() => {
    if (meState.status === "loggedIn" && meState.me.role === "CERIMONIARIO") {
      void load();
    }
  }, [load, meState]);

  React.useEffect(() => {
    if (meState.status === "loggedOut") {
      router.replace("/login");
      return;
    }
    if (meState.status === "loggedIn" && meState.me.role !== "CERIMONIARIO") {
      router.replace("/masses");
    }
  }, [meState, router]);

  const createRole = async () => {
    const score = Number(newRole.score);
    if (!newRole.label.trim() || !Number.isFinite(score)) {
      setError("Preencha nome e pontuacao valida para a funcao");
      return;
    }

    setError(null);
    setInfo(null);
    setCreatingRole(true);
    try {
      await apiFetch("/api/liturgy/roles", {
        method: "POST",
        body: JSON.stringify({
          label: newRole.label,
          description: newRole.description,
          score,
          active: newRole.active === "true",
        }),
      });
      setNewRole({ label: "", description: "", score: "0", active: "true" });
      setInfo("Funcao criada com sucesso");
      await load();
    } catch (e) {
      setError(toUiErrorMessage(e, "Erro ao criar funcao"));
    } finally {
      setCreatingRole(false);
    }
  };

  const saveRole = async (key: string) => {
    const draft = roleDrafts[key];
    if (!draft) return;
    setSavingRoleKey(key);
    setError(null);
    setInfo(null);
    try {
      await apiFetch("/api/liturgy/roles", {
        method: "PATCH",
        body: JSON.stringify(draft),
      });
      setInfo(`Funcao ${key} atualizada`);
      await load();
    } catch (e) {
      setError(toUiErrorMessage(e, "Erro ao atualizar funcao"));
    } finally {
      setSavingRoleKey(null);
    }
  };

  const createMassType = async () => {
    if (!newMassType.label.trim() || newMassType.roleKeys.length === 0) {
      setError("Preencha nome e selecione ao menos uma funcao");
      return;
    }

    setError(null);
    setInfo(null);
    setCreatingMassType(true);
    try {
      await apiFetch("/api/liturgy/mass-types", {
        method: "POST",
        body: JSON.stringify({
          label: newMassType.label,
          roleKeys: newMassType.roleKeys,
          fallbackRoleKey: newMassType.fallbackRoleKey || null,
          active: newMassType.active === "true",
        }),
      });
      setNewMassType({ label: "", roleKeys: [], fallbackRoleKey: "", active: "true" });
      setInfo("Tipo de missa criado com sucesso");
      await load();
    } catch (e) {
      setError(toUiErrorMessage(e, "Erro ao criar tipo de missa"));
    } finally {
      setCreatingMassType(false);
    }
  };

  const saveMassType = async (key: string) => {
    const draft = massTypeDrafts[key];
    if (!draft) return;
    setSavingMassTypeKey(key);
    setError(null);
    setInfo(null);
    try {
      await apiFetch("/api/liturgy/mass-types", {
        method: "PATCH",
        body: JSON.stringify({
          ...draft,
          fallbackRoleKey: draft.fallbackRoleKey || null,
        }),
      });
      setInfo(`Tipo de missa ${key} atualizado`);
      await load();
    } catch (e) {
      setError(toUiErrorMessage(e, "Erro ao atualizar tipo de missa"));
    } finally {
      setSavingMassTypeKey(null);
    }
  };

  const toggleMassTypeRole = (
    target: { roleKeys: string[]; fallbackRoleKey?: string | null },
    setTarget: (patch: Partial<{ roleKeys: string[]; fallbackRoleKey: string }>) => void,
    roleKey: string
  ) => {
    const exists = target.roleKeys.includes(roleKey);
    if (exists) {
      const nextRoleKeys = target.roleKeys.filter((key) => key !== roleKey);
      const nextFallback = target.fallbackRoleKey === roleKey ? "" : (target.fallbackRoleKey ?? "");
      setTarget({ roleKeys: nextRoleKeys, fallbackRoleKey: nextFallback });
      return;
    }
    setTarget({ roleKeys: [...target.roleKeys, roleKey] });
  };

  if (meState.status === "loading" || loading) return <LiturgySkeleton />;
  if (meState.status === "loggedOut") {
    return null;
  }
  if (meState.me.role !== "CERIMONIARIO") {
    return null;
  }

  return (
    <AppShell
      user={meState.me}
      title="Liturgia"
      description="Cadastre funcoes, pontuacoes, tipos de missa e callback para excedente de acolitos."
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

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Nova funcao</CardTitle>
            <CardDescription>A chave numerica e gerada automaticamente pelo sistema.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Input
              placeholder="Nome exibido"
              value={newRole.label}
              onChange={(event) => setNewRole((prev) => ({ ...prev, label: event.target.value }))}
            />
            <Input
              placeholder="Descricao"
              value={newRole.description}
              onChange={(event) => setNewRole((prev) => ({ ...prev, description: event.target.value }))}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                type="number"
                min={0}
                max={1000}
                value={newRole.score}
                onChange={(event) => setNewRole((prev) => ({ ...prev, score: event.target.value }))}
              />
              <Select value={newRole.active} onValueChange={(value) => setNewRole((prev) => ({ ...prev, active: value as "true" | "false" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Ativa</SelectItem>
                  <SelectItem value="false">Inativa</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" disabled={creatingRole} onClick={() => void createRole()}>
                {creatingRole ? "Criando..." : "Criar funcao"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Novo tipo de missa</CardTitle>
            <CardDescription>A chave numerica e gerada automaticamente pelo sistema.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3">
              <Input
                placeholder="Nome exibido"
                value={newMassType.label}
                onChange={(event) => setNewMassType((prev) => ({ ...prev, label: event.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select value={newMassType.active} onValueChange={(value) => setNewMassType((prev) => ({ ...prev, active: value as "true" | "false" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Ativo</SelectItem>
                  <SelectItem value="false">Inativo</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={newMassType.fallbackRoleKey || "__NONE__"}
                onValueChange={(value) => setNewMassType((prev) => ({ ...prev, fallbackRoleKey: value === "__NONE__" ? "" : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Funcao callback (excedente)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__NONE__">Sem callback</SelectItem>
                  {roles
                    .filter((role) => newMassType.roleKeys.includes(role.key))
                    .map((role) => (
                      <SelectItem key={`new-callback-${role.key}`} value={role.key}>
                        {role.label} (#{role.key})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <RoleSelector
              title="Funcoes do novo tipo"
              roleOptions={roles}
              selectedRoleKeys={newMassType.roleKeys}
              onToggle={(roleKey) =>
                toggleMassTypeRole(
                  newMassType,
                  (patch) =>
                    setNewMassType((prev) => ({
                      ...prev,
                      ...(patch.roleKeys ? { roleKeys: patch.roleKeys } : {}),
                      ...(patch.fallbackRoleKey !== undefined ? { fallbackRoleKey: patch.fallbackRoleKey } : {}),
                    })),
                  roleKey
                )
              }
            />
            <Button type="button" disabled={creatingMassType} onClick={() => void createMassType()} className="w-full">
              {creatingMassType ? "Criando tipo..." : "Criar tipo de missa"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Funcoes cadastradas</CardTitle>
          <CardDescription>Edite nome, pontuacao e status. A chave numerica nao e editavel.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {roles.map((role) => {
            const draft = roleDrafts[role.key];
            if (!draft) return null;
            return (
              <div key={role.key} className="grid gap-3 rounded-md border p-3 md:grid-cols-6">
                <Input value={`#${draft.key}`} disabled />
                <Input value={draft.label} onChange={(event) => setRoleDrafts((prev) => ({ ...prev, [role.key]: { ...draft, label: event.target.value } }))} />
                <Input
                  value={draft.description}
                  onChange={(event) => setRoleDrafts((prev) => ({ ...prev, [role.key]: { ...draft, description: event.target.value } }))}
                />
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  value={String(draft.score)}
                  onChange={(event) => setRoleDrafts((prev) => ({ ...prev, [role.key]: { ...draft, score: Number(event.target.value) } }))}
                />
                <Select
                  value={draft.active ? "true" : "false"}
                  onValueChange={(value) => setRoleDrafts((prev) => ({ ...prev, [role.key]: { ...draft, active: value === "true" } }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Ativa</SelectItem>
                    <SelectItem value="false">Inativa</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" disabled={savingRoleKey === role.key} onClick={() => void saveRole(role.key)}>
                  {savingRoleKey === role.key ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tipos de missa cadastrados</CardTitle>
          <CardDescription>Vincule funcoes e escolha a callback para acolitos excedentes.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {massTypes.map((massType) => {
            const draft = massTypeDrafts[massType.key];
            if (!draft) return null;
            return (
              <div key={massType.key} className="space-y-3 rounded-md border p-3">
                <div className="grid gap-3 md:grid-cols-5">
                  <Input value={draft.key} disabled />
                  <Input
                    value={draft.label}
                    onChange={(event) => setMassTypeDrafts((prev) => ({ ...prev, [massType.key]: { ...draft, label: event.target.value } }))}
                  />
                  <Select
                    value={draft.active ? "true" : "false"}
                    onValueChange={(value) => setMassTypeDrafts((prev) => ({ ...prev, [massType.key]: { ...draft, active: value === "true" } }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Ativo</SelectItem>
                      <SelectItem value="false">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={draft.fallbackRoleKey ?? "__NONE__"}
                    onValueChange={(value) =>
                      setMassTypeDrafts((prev) => ({
                        ...prev,
                        [massType.key]: { ...draft, fallbackRoleKey: value === "__NONE__" ? null : value },
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Funcao callback" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__NONE__">Sem callback</SelectItem>
                      {roles
                        .filter((role) => draft.roleKeys.includes(role.key))
                        .map((role) => (
                          <SelectItem key={`edit-callback-${massType.key}-${role.key}`} value={role.key}>
                            {role.label} (#{role.key})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" disabled={savingMassTypeKey === massType.key} onClick={() => void saveMassType(massType.key)}>
                    {savingMassTypeKey === massType.key ? "Salvando..." : "Salvar tipo"}
                  </Button>
                </div>
                <RoleSelector
                  title={`Funcoes do tipo ${draft.label}`}
                  roleOptions={roles}
                  selectedRoleKeys={draft.roleKeys}
                  onToggle={(roleKey) =>
                    toggleMassTypeRole(
                      draft,
                      (patch) =>
                        setMassTypeDrafts((prev) => ({
                          ...prev,
                          [massType.key]: {
                            ...draft,
                            ...(patch.roleKeys ? { roleKeys: patch.roleKeys } : {}),
                            ...(patch.fallbackRoleKey !== undefined ? { fallbackRoleKey: patch.fallbackRoleKey || null } : {}),
                          },
                        })),
                      roleKey
                    )
                  }
                />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </AppShell>
  );
}

function RoleSelector({
  title,
  roleOptions,
  selectedRoleKeys,
  onToggle,
}: {
  title: string;
  roleOptions: LiturgyRole[];
  selectedRoleKeys: string[];
  onToggle: (roleKey: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {title} ({selectedRoleKeys.length} selecionada{selectedRoleKeys.length === 1 ? "" : "s"})
      </p>
      <div className="flex flex-wrap gap-2">
        {roleOptions.map((role) => (
          <Button
            key={role.key}
            type="button"
            size="sm"
            variant={selectedRoleKeys.includes(role.key) ? "default" : "outline"}
            onClick={() => onToggle(role.key)}
          >
            {role.label} (#{role.key}){role.active ? "" : " - inativa"}
          </Button>
        ))}
      </div>
    </div>
  );
}

function LiturgySkeleton() {
  return (
    <main className="min-h-screen space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-52 w-full" />
      <Skeleton className="h-52 w-full" />
      <Skeleton className="h-52 w-full" />
    </main>
  );
}
