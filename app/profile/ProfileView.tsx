"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe } from "@/hooks/use-me";
import { ApiClientError, apiFetch } from "@/lib/api";

type ProfileResponse = {
  id: string;
  role: "CERIMONIARIO" | "ACOLITO";
  name: string;
  username: string;
  active: boolean;
  globalScore: number;
};

type MePatchResponse = {
  ok: true;
  user: ProfileResponse;
};

export function ProfileView() {
  const meState = useMe();
  const router = useRouter();

  const [profile, setProfile] = React.useState<ProfileResponse | null>(null);
  const [name, setName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [savingPassword, setSavingPassword] = React.useState(false);

  const loadProfile = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const data = await apiFetch<ProfileResponse>("/api/me");
      setProfile(data);
      setName(data.name);
      setUsername(data.username);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Erro ao carregar perfil");
    } finally {
      setLoading(false);
    }
  }, [router]);

  React.useEffect(() => {
    if (meState.status === "loggedIn") {
      void loadProfile();
    }
  }, [loadProfile, meState.status]);

  const saveProfile = async () => {
    setSavingProfile(true);
    setError(null);
    setInfo(null);

    try {
      const result = await apiFetch<MePatchResponse>("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ name, username }),
      });
      setProfile(result.user);
      setName(result.user.name);
      setUsername(result.user.username);
      setInfo("Perfil atualizado com sucesso");
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Erro ao salvar perfil");
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Preencha senha atual, nova senha e confirmacao");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("A confirmacao da senha nao confere");
      return;
    }

    setSavingPassword(true);
    setError(null);
    setInfo(null);

    try {
      await apiFetch<{ ok: true }>("/api/me/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setInfo("Senha atualizada com sucesso");
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Erro ao atualizar senha");
    } finally {
      setSavingPassword(false);
    }
  };

  if (meState.status === "loading" || loading) {
    return (
      <main className="min-h-screen space-y-6 p-6 md:p-8">
        <Skeleton className="h-8 w-56" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
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

  const shellUser = profile ? { ...meState.me, name: profile.name } : meState.me;

  return (
    <AppShell user={shellUser} title="Perfil" description="Atualize seus dados e sua senha.">
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

      <Tabs defaultValue="data" className="space-y-4">
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="data">Dados</TabsTrigger>
          <TabsTrigger value="password">Senha</TabsTrigger>
        </TabsList>

        <TabsContent value="data">
          <Card>
            <CardHeader>
              <CardTitle>Dados da conta</CardTitle>
              <CardDescription>Atualize nome e username/email da sua conta.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="profile-name">Nome</Label>
                  <Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-username">Username/Email</Label>
                  <Input
                    id="profile-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value.toLowerCase())}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1 rounded-md border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Papel</p>
                  <p className="text-sm font-medium">{profile?.role ?? "-"}</p>
                </div>
                <div className="space-y-1 rounded-md border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Ativo</p>
                  <p className="text-sm font-medium">{profile?.active ? "Sim" : "Nao"}</p>
                </div>
                <div className="space-y-1 rounded-md border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Score global</p>
                  <p className="text-sm font-medium">{profile?.globalScore ?? "-"}</p>
                </div>
              </div>

              <Button type="button" onClick={() => void saveProfile()} disabled={savingProfile}>
                {savingProfile ? "Salvando..." : "Salvar dados"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="password">
          <Card>
            <CardHeader>
              <CardTitle>Atualizar senha</CardTitle>
              <CardDescription>Informe a senha atual e defina a nova senha.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Senha atual</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">Nova senha</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </div>
              </div>

              <Button type="button" onClick={() => void changePassword()} disabled={savingPassword}>
                {savingPassword ? "Atualizando..." : "Atualizar senha"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
