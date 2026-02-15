"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useMe } from "@/hooks/use-me";
import { ApiClientError, apiFetch } from "@/lib/api";
import { resolveMassName } from "@/lib/mass-name";
import { getMassRoleDescription, getMassRoleLabel } from "@/lib/mass-role-labels";
import { formatDateTime, statusLabel } from "@/lib/mass-ui";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Entry = { userId: string; userName: string | null; joinedAt?: string; confirmedAt?: string };
type PendingEntry = { requestId: string; userId: string; userName: string | null; requestedAt: string };
type Assignment = { roleKey: string; userId: string | null; userName: string | null };
type Event = { type: string; actorId: string; actorName: string | null; at: string };
type UserOption = { id: string; name: string };
type AttendanceState = "JOINED" | "PENDING" | "CONFIRMED";
type AttendanceListItem = {
  userId: string;
  userName: string | null;
  state: AttendanceState;
  happenedAt: string | null;
};

type MassDetailResponse = {
  id: string;
  name: string;
  status: string;
  massType: string;
  scheduledAt: string;
  chiefBy: string;
  chiefByName: string | null;
  createdBy: string;
  createdByName: string | null;
  attendance: { joined: Entry[]; confirmed: Entry[]; pending: PendingEntry[] };
  assignments: Assignment[];
  events: Event[];
};

type TemplateResponse = Record<string, string[]>;
type UserResponse = { items: UserOption[] };
type LiturgyOverviewResponse = {
  roles: Array<{ key: string; label: string; description: string }>;
  massTypes: Array<{ key: string; label: string }>;
};
type ConfirmRequestResponse = { ok: true; requestId: string; qrPayload: string };
type ConfirmScanResponse = {
  ok: true;
  requestId: string;
  acolito: { userId: string; name: string | null };
  mass: { id: string; scheduledAt: string; massType: string; chiefByName: string | null; createdByName: string | null };
};
type AutoAssignResponse = { ok: true; assignments: Assignment[] };

const NONE_ROLE_KEY = "NONE";
const VACANT_VALUE = "__VACANT__";
const SHORT_ID_HEAD = 6;
const SHORT_ID_TAIL = 4;
const QR_SIZE = 320;
const attendanceStateMeta: Record<
  AttendanceState,
  { label: string; timeLabel: string; priority: number; chipClassName: string }
> = {
  JOINED: {
    label: "Participando",
    timeLabel: "Entrou em",
    priority: 1,
    chipClassName: "border border-sky-200 bg-sky-50 text-sky-800",
  },
  PENDING: {
    label: "Aguardando validacao",
    timeLabel: "Solicitou em",
    priority: 2,
    chipClassName: "border border-amber-200 bg-amber-50 text-amber-800",
  },
  CONFIRMED: {
    label: "Confirmado",
    timeLabel: "Confirmado em",
    priority: 3,
    chipClassName: "border border-emerald-200 bg-emerald-50 text-emerald-800",
  },
};

const shortenId = (id: string): string => `${id.slice(0, SHORT_ID_HEAD)}...${id.slice(-SHORT_ID_TAIL)}`;
const userLabel = (name: string | null, id: string | null): string => {
  if (name) return name;
  if (!id) return "Usuario nao encontrado";
  return `Usuario nao encontrado (${shortenId(id)})`;
};
const buildQrPayload = (massId: string, requestId: string): string =>
  JSON.stringify({ type: "MASS_CONFIRMATION", massId, requestId });
const buildVacantAssignments = (roleKeys: string[]): Assignment[] =>
  roleKeys
    .filter((roleKey) => roleKey !== NONE_ROLE_KEY)
    .map((roleKey) => ({ roleKey, userId: null, userName: null }));

export function MassDetail({ id }: { id: string }) {
  const router = useRouter();
  const meState = useMe();

  const [mass, setMass] = React.useState<MassDetailResponse | null>(null);
  const [templates, setTemplates] = React.useState<TemplateResponse | null>(null);
  const [acolitos, setAcolitos] = React.useState<UserOption[]>([]);
  const [cerimoniarios, setCerimoniarios] = React.useState<UserOption[]>([]);
  const [roleInfoByKey, setRoleInfoByKey] = React.useState<Record<string, { label: string; description: string }>>({});
  const [massTypeLabelByKey, setMassTypeLabelByKey] = React.useState<Record<string, string>>({});
  const [draftAssignments, setDraftAssignments] = React.useState<Assignment[]>([]);
  const [delegateTo, setDelegateTo] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [acting, setActing] = React.useState(false);
  const [showQr, setShowQr] = React.useState(false);
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const [scannerError, setScannerError] = React.useState<string | null>(null);
  const [scanPreview, setScanPreview] = React.useState<ConfirmScanResponse | null>(null);
  const [reviewing, setReviewing] = React.useState(false);
  const [scanningFrame, setScanningFrame] = React.useState(false);
  const [manualRequestCode, setManualRequestCode] = React.useState("");
  const [manualScanning, setManualScanning] = React.useState(false);

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const scanBusyRef = React.useRef(false);
  const detectorRef = React.useRef<{ detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>> } | null>(null);
  const scanCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const massData = await apiFetch<MassDetailResponse>(`/api/masses/${id}`);
      setMass(massData);
      setDraftAssignments(massData.assignments);
      setDelegateTo(massData.chiefBy);

      const requests: Promise<void>[] = [
        apiFetch<UserResponse>("/api/users?role=CERIMONIARIO&active=true").then((usersData) => {
          setCerimoniarios(usersData.items);
        }),
        apiFetch<LiturgyOverviewResponse>("/api/liturgy/overview")
          .then((overview) => {
            setRoleInfoByKey(
              Object.fromEntries(
                overview.roles.map((role) => [
                  role.key,
                  {
                    label: role.label,
                    description: role.description,
                  },
                ])
              )
            );
            setMassTypeLabelByKey(Object.fromEntries(overview.massTypes.map((massType) => [massType.key, massType.label])));
          })
          .catch(() => {
            setRoleInfoByKey({});
            setMassTypeLabelByKey({});
          }),
      ];

      if (massData.status === "PREPARATION") {
        requests.push(
          apiFetch<TemplateResponse>("/api/masses/role-templates").then((templateData) => {
            setTemplates(templateData);
          })
        );
        requests.push(
          apiFetch<UserResponse>("/api/users?role=ACOLITO&active=true").then((usersData) => {
            setAcolitos(usersData.items);
          })
        );
      } else {
        setTemplates(null);
        setAcolitos([]);
      }

      await Promise.all(requests);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Erro ao carregar missa");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!mass || mass.status !== "PREPARATION" || !templates) {
      return;
    }

    if (mass.assignments.length > 0 || draftAssignments.length > 0) {
      return;
    }

    setDraftAssignments(buildVacantAssignments(templates[mass.massType] ?? []));
  }, [draftAssignments.length, mass, templates]);

  const callAction = async (path: string, body?: unknown) => {
    setActing(true);
    setError(null);

    try {
      await apiFetch<{ ok: boolean }>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
      await load();
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Erro de acao");
    } finally {
      setActing(false);
    }
  };

  const autoAssignRoles = async () => {
    setActing(true);
    setError(null);

    try {
      const result = await apiFetch<AutoAssignResponse>(`/api/masses/${id}/assign-roles/auto`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setDraftAssignments(result.assignments);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Erro ao atribuir funcoes automaticamente");
    } finally {
      setActing(false);
    }
  };

  const stopScanner = React.useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    detectorRef.current = null;
    scanBusyRef.current = false;
    setScanningFrame(false);
  }, []);

  const startScanner = React.useCallback(async () => {
    stopScanner();
    setScannerError(null);
    setScanPreview(null);

    try {
      if (typeof window === "undefined" || !("mediaDevices" in navigator) || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera nao suportada neste dispositivo.");
      }

      const BarcodeDetectorCtor = (window as Window & { BarcodeDetector?: new (options?: unknown) => { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
      if (!BarcodeDetectorCtor) {
        throw new Error("Leitor de QR nao suportado neste navegador.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      detectorRef.current = new BarcodeDetectorCtor({ formats: ["qr_code"] });
    } catch (e) {
      setScannerError(e instanceof Error ? e.message : "Nao foi possivel abrir a camera.");
    }
  }, [stopScanner]);

  const scanQrFrame = React.useCallback(async () => {
    if (!videoRef.current || !detectorRef.current) {
      setScannerError("Camera ainda nao esta pronta.");
      return;
    }
    if (scanBusyRef.current) return;
    if (videoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setScannerError("Aguardando camera estabilizar. Tente novamente.");
      return;
    }

    scanBusyRef.current = true;
    setScanningFrame(true);
    setScannerError(null);

    try {
      const video = videoRef.current;
      const frameWidth = video.videoWidth;
      const frameHeight = video.videoHeight;
      if (!frameWidth || !frameHeight) {
        setScannerError("Nao foi possivel capturar a imagem da camera.");
        return;
      }

      if (!scanCanvasRef.current) {
        scanCanvasRef.current = document.createElement("canvas");
      }
      const canvas = scanCanvasRef.current;
      if (canvas.width !== frameWidth || canvas.height !== frameHeight) {
        canvas.width = frameWidth;
        canvas.height = frameHeight;
      }

      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        setScannerError("Nao foi possivel processar o frame da camera.");
        return;
      }

      context.drawImage(video, 0, 0, frameWidth, frameHeight);
      const codes = await detectorRef.current.detect(canvas);
      const value = codes[0]?.rawValue;
      if (!value) {
        setScannerError("Nenhum QR detectado. Ajuste foco/distancia e tente novamente.");
        return;
      }

      const preview = await apiFetch<ConfirmScanResponse>(`/api/masses/${id}/confirm/scan`, {
        method: "POST",
        body: JSON.stringify({ qrPayload: value }),
      });
      setScanPreview(preview);
      stopScanner();
    } catch (e) {
      setScannerError(e instanceof Error ? e.message : "Falha ao ler o QR.");
    } finally {
      scanBusyRef.current = false;
      setScanningFrame(false);
    }
  }, [id, stopScanner]);

  const scanByManualCode = React.useCallback(async () => {
    const requestCode = manualRequestCode.trim();
    if (!requestCode) {
      setScannerError("Informe o codigo de confirmacao.");
      return;
    }

    setScannerError(null);
    setManualScanning(true);
    try {
      const preview = await apiFetch<ConfirmScanResponse>(`/api/masses/${id}/confirm/scan`, {
        method: "POST",
        body: JSON.stringify({
          qrPayload: buildQrPayload(id, requestCode),
        }),
      });
      setScanPreview(preview);
      stopScanner();
    } catch (e) {
      setScannerError(e instanceof Error ? e.message : "Falha ao validar codigo.");
    } finally {
      setManualScanning(false);
    }
  }, [id, manualRequestCode, stopScanner]);

  React.useEffect(() => {
    if (!scannerOpen) {
      stopScanner();
      return;
    }
    void startScanner();
    return stopScanner;
  }, [scannerOpen, startScanner, stopScanner]);

  const requestConfirmation = async () => {
    setActing(true);
    setError(null);

    try {
      const result = await apiFetch<ConfirmRequestResponse>(`/api/masses/${id}/confirm/request`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setManualRequestCode(result.requestId);
      setShowQr(true);
      await load();
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Erro ao solicitar confirmacao de presenca");
    } finally {
      setActing(false);
    }
  };

  const reviewScannedAcolito = async (decision: "confirm" | "deny") => {
    if (!scanPreview) return;

    setReviewing(true);
    setError(null);
    try {
      await apiFetch<{ ok: boolean }>(`/api/masses/${id}/confirm`, {
        method: "POST",
        body: JSON.stringify({ requestId: scanPreview.requestId, decision }),
      });
      setScanPreview(null);
      await load();
      await startScanner();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao revisar confirmacao");
    } finally {
      setReviewing(false);
    }
  };

  if (meState.status === "loading" || loading || !mass) {
    return <MassDetailSkeleton />;
  }

  if (meState.status === "loggedOut") {
    router.replace("/login");
    return null;
  }

  const isAdmin = meState.me.role === "CERIMONIARIO";
  const isCreator = mass.createdBy === meState.me.id;
  const canAdminThisMass = isAdmin && (isCreator || mass.chiefBy === meState.me.id);
  const hasJoined = mass.attendance.joined.some((entry) => entry.userId === meState.me.id);
  const hasConfirmed = mass.attendance.confirmed.some((entry) => entry.userId === meState.me.id);
  const myPending = mass.attendance.pending.find((entry) => entry.userId === meState.me.id) ?? null;
  const activeRequestId = myPending?.requestId ?? null;
  const activeQrPayload = activeRequestId ? buildQrPayload(id, activeRequestId) : null;
  const qrImageUrl = activeQrPayload
    ? `https://api.qrserver.com/v1/create-qr-code/?size=${QR_SIZE}x${QR_SIZE}&data=${encodeURIComponent(activeQrPayload)}`
    : null;

  const templateRoles = templates?.[mass.massType] ?? [];
  const fixedRoles = templateRoles.filter((role) => role !== NONE_ROLE_KEY);
  const noneAssignments = draftAssignments
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.roleKey === NONE_ROLE_KEY);
  const recentEvents = mass.events.slice(-20).reverse();
  const resolveRoleLabel = (roleKey: string): string => roleInfoByKey[roleKey]?.label ?? getMassRoleLabel(roleKey);
  const resolveRoleDescription = (roleKey: string): string => roleInfoByKey[roleKey]?.description ?? getMassRoleDescription(roleKey);
  const massTypeLabel = massTypeLabelByKey[mass.massType] ?? mass.massType;
  const myAttendanceStatus = (() => {
    const confirmedEntry = mass.attendance.confirmed.find((entry) => entry.userId === meState.me.id);
    if (confirmedEntry) {
      return {
        label: "Confirmado",
        timeLabel: "Confirmado em",
        happenedAt: confirmedEntry.confirmedAt ?? null,
        className: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-300/20 dark:bg-emerald-200/5 dark:text-emerald-100",
      };
    }

    const pendingEntry = mass.attendance.pending.find((entry) => entry.userId === meState.me.id);
    if (pendingEntry) {
      return {
        label: "Aguardando validacao",
        timeLabel: "Solicitado em",
        happenedAt: pendingEntry.requestedAt ?? null,
        className: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-300/20 dark:bg-amber-200/5 dark:text-amber-100",
      };
    }

    const joinedEntry = mass.attendance.joined.find((entry) => entry.userId === meState.me.id);
    if (joinedEntry) {
      return {
        label: "Participando",
        timeLabel: "Entrou em",
        happenedAt: joinedEntry.joinedAt ?? null,
        className: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-300/20 dark:bg-sky-200/5 dark:text-sky-100",
      };
    }

    return {
      label: "Nao participou ainda",
      timeLabel: "Sem registro",
      happenedAt: null,
      className: "border-border bg-background text-foreground",
    };
  })();
  const attendanceList = (() => {
    const byUserId = new Map<string, AttendanceListItem>();

    const upsert = (candidate: AttendanceListItem) => {
      const current = byUserId.get(candidate.userId);
      if (!current) {
        byUserId.set(candidate.userId, candidate);
        return;
      }

      const candidatePriority = attendanceStateMeta[candidate.state].priority;
      const currentPriority = attendanceStateMeta[current.state].priority;
      if (candidatePriority > currentPriority) {
        byUserId.set(candidate.userId, candidate);
        return;
      }

      if (candidatePriority === currentPriority) {
        const candidateTime = candidate.happenedAt ? new Date(candidate.happenedAt).getTime() : 0;
        const currentTime = current.happenedAt ? new Date(current.happenedAt).getTime() : 0;
        if (candidateTime > currentTime) {
          byUserId.set(candidate.userId, candidate);
        }
      }
    };

    for (const entry of mass.attendance.joined) {
      upsert({
        userId: entry.userId,
        userName: entry.userName,
        state: "JOINED",
        happenedAt: entry.joinedAt ?? null,
      });
    }

    for (const entry of mass.attendance.pending) {
      upsert({
        userId: entry.userId,
        userName: entry.userName,
        state: "PENDING",
        happenedAt: entry.requestedAt ?? null,
      });
    }

    for (const entry of mass.attendance.confirmed) {
      upsert({
        userId: entry.userId,
        userName: entry.userName,
        state: "CONFIRMED",
        happenedAt: entry.confirmedAt ?? null,
      });
    }

    return Array.from(byUserId.values()).sort((left, right) => {
      const priorityDiff = attendanceStateMeta[right.state].priority - attendanceStateMeta[left.state].priority;
      if (priorityDiff !== 0) return priorityDiff;

      const rightTime = right.happenedAt ? new Date(right.happenedAt).getTime() : 0;
      const leftTime = left.happenedAt ? new Date(left.happenedAt).getTime() : 0;
      if (rightTime !== leftTime) return rightTime - leftTime;

      return userLabel(left.userName, left.userId).localeCompare(userLabel(right.userName, right.userId), "pt-BR");
    });
  })();
  const tabsGridClassName = isCreator ? "grid-cols-2 sm:grid-cols-4" : isAdmin ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2";

  return (
    <AppShell
      user={meState.me}
      title={resolveMassName(mass.name, mass.scheduledAt)}
      description="Acompanhe presenca, funcoes e operacoes da celebracao."
    >
      {error && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Resumo da missa</CardTitle>
          <CardDescription>Panorama rapido da celebracao e indicadores de presenca.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
          <section className="grid gap-3 sm:grid-cols-2">
            <SummaryDetailItem label="Data e horario" value={formatDateTime(mass.scheduledAt)} />
            <SummaryDetailItem label="Nome da missa" value={resolveMassName(mass.name, mass.scheduledAt)} />
            <SummaryDetailItem label="Status atual" value={statusLabel[mass.status] ?? mass.status} />
            <SummaryDetailItem label="Tipo de celebracao" value={massTypeLabel} />
            <SummaryDetailItem label="Criada por" value={userLabel(mass.createdByName, mass.createdBy)} />
            <SummaryDetailItem label="Responsavel principal" value={userLabel(mass.chiefByName, mass.chiefBy)} />
          </section>
          {isAdmin ? (
            <section className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Indicadores de presenca</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                <PresenceMetricItem
                  label="Participando"
                  value={mass.attendance.joined.length}
                  className="border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-300/20 dark:bg-sky-200/5 dark:text-sky-100"
                />
                <PresenceMetricItem
                  label="Confirmados"
                  value={mass.attendance.confirmed.length}
                  className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-300/20 dark:bg-emerald-200/5 dark:text-emerald-100"
                />
                <PresenceMetricItem
                  label="Pendentes"
                  value={mass.attendance.pending.length}
                  className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-300/20 dark:bg-amber-200/5 dark:text-amber-100"
                />
              </div>
            </section>
          ) : (
            <section className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Meu status nesta missa</p>
              <div className={`mt-3 rounded-md border p-3 ${myAttendanceStatus.className}`}>
                <p className="text-sm font-semibold">{myAttendanceStatus.label}</p>
                <p className="mt-1 text-xs opacity-80">
                  {myAttendanceStatus.happenedAt
                    ? `${myAttendanceStatus.timeLabel}: ${formatDateTime(myAttendanceStatus.happenedAt)}`
                    : myAttendanceStatus.timeLabel}
                </p>
              </div>
            </section>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acoes disponiveis</CardTitle>
          <CardDescription>Comandos permitidos para o seu perfil no estado atual da missa.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {canAdminThisMass && mass.status === "SCHEDULED" && (
            <>
              <Button type="button" onClick={() => void callAction(`/api/masses/${id}/open`)} disabled={acting}>
                Abrir missa
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void callAction(`/api/masses/${id}/cancel`)}
                disabled={acting}
              >
                Cancelar missa
              </Button>
            </>
          )}

          {canAdminThisMass && mass.status === "OPEN" && (
            <>
              <Button
                type="button"
                onClick={() => void callAction(`/api/masses/${id}/preparation`)}
                disabled={acting}
              >
                Iniciar preparacao
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void callAction(`/api/masses/${id}/cancel`)}
                disabled={acting}
              >
                Cancelar missa
              </Button>
              <Button type="button" variant="outline" onClick={() => setScannerOpen(true)} disabled={acting}>
                Validar acolitos via QR
              </Button>
            </>
          )}

          {canAdminThisMass && mass.status === "PREPARATION" && (
            <Button type="button" onClick={() => void callAction(`/api/masses/${id}/finish`)} disabled={acting}>
              Finalizar missa
            </Button>
          )}

          {!isAdmin && mass.status === "OPEN" && !hasConfirmed && !hasJoined && (
            <Button type="button" variant="outline" onClick={() => void callAction(`/api/masses/${id}/join`)} disabled={acting}>
              Entrar na missa
            </Button>
          )}

          {!isAdmin && mass.status === "OPEN" && !hasConfirmed && hasJoined && !myPending && (
            <Button type="button" onClick={() => void requestConfirmation()} disabled={acting}>
              Solicitar confirmacao de presenca
            </Button>
          )}

          {!isAdmin && mass.status === "OPEN" && !hasConfirmed && hasJoined && myPending && (
            <>
              <Button type="button" variant="outline" onClick={() => setShowQr(true)} disabled={acting}>
                Exibir QR code
              </Button>
              <p className="text-sm text-muted-foreground">Aguardando validacao do cerimoniario.</p>
            </>
          )}

          {!isAdmin && hasConfirmed && <p className="text-sm text-muted-foreground">Presenca confirmada.</p>}
        </CardContent>
      </Card>

      <Tabs
        key={mass.status === "PREPARATION" ? "tabs-preparation" : "tabs-default"}
        defaultValue={mass.status === "PREPARATION" ? "assignments" : "attendance"}
        className="space-y-4"
      >
        <TabsList className={`grid h-auto w-full gap-1 ${tabsGridClassName}`}>
          <TabsTrigger value="attendance" className="w-full">
            Presenca
          </TabsTrigger>
          <TabsTrigger value="assignments" className="w-full">
            Funcoes
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="events" className="w-full">
              Eventos
            </TabsTrigger>
          )}
          {isCreator && (
            <TabsTrigger value="admin" className="w-full">
              Admin
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="attendance">
          <Card>
            <CardHeader className="space-y-3">
              <div className="space-y-1">
                <CardTitle>Presenca de acolitos</CardTitle>
                <CardDescription>Lista unica com cada acolito e o status atual na missa.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${attendanceStateMeta.JOINED.chipClassName}`}>
                  Participando: {mass.attendance.joined.length}
                </span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${attendanceStateMeta.PENDING.chipClassName}`}>
                  Pendentes: {mass.attendance.pending.length}
                </span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${attendanceStateMeta.CONFIRMED.chipClassName}`}>
                  Confirmados: {mass.attendance.confirmed.length}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {attendanceList.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum acolito registrado nesta missa.</p>
              ) : (
                <ul className="space-y-3">
                  {attendanceList.map((item) => {
                    const stateMeta = attendanceStateMeta[item.state];
                    const canOpenProfile = isAdmin || item.userId === meState.me.id;
                    const profileHref = isAdmin ? `/users/${item.userId}` : "/profile";
                    return (
                      <li key={`${item.userId}-${item.state}`} className="rounded-lg border p-3 sm:p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 space-y-1">
                            <p className="truncate text-sm font-semibold">{userLabel(item.userName, item.userId)}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.happenedAt ? `${stateMeta.timeLabel}: ${formatDateTime(item.happenedAt)}` : "Horario nao informado"}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${stateMeta.chipClassName}`}>
                              {stateMeta.label}
                            </span>
                            {canOpenProfile ? (
                              <Button asChild size="sm" variant="outline">
                                <Link href={profileHref}>{isAdmin ? "Abrir perfil" : "Meu perfil"}</Link>
                              </Button>
                            ) : (
                              <Button type="button" size="sm" variant="outline" disabled>
                                Perfil restrito
                              </Button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments">
          <Card>
            <CardHeader>
              <CardTitle>Atribuicao de funcoes</CardTitle>
              <CardDescription>
                {mass.status === "PREPARATION" && canAdminThisMass
                  ? "Distribua os acolitos por funcao de forma clara e rapida."
                  : "Configuracao final de funcoes desta missa."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mass.status === "PREPARATION" && canAdminThisMass && templates ? (
                <>
                  <div className="rounded-md border bg-muted/20 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Funcoes da missa</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Utilize atribuicao automatica para sugestao inicial e ajuste manualmente quando precisar.
                    </p>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    {fixedRoles.map((roleKey) => {
                      const current = draftAssignments.find((entry) => entry.roleKey === roleKey) ?? {
                        roleKey,
                        userId: null,
                        userName: null,
                      };
                      return (
                        <AssignmentEditorCard
                          key={roleKey}
                          roleLabel={resolveRoleLabel(roleKey)}
                          roleDescription={resolveRoleDescription(roleKey)}
                          value={current.userId}
                          users={acolitos}
                          onChange={(userId) => {
                            setDraftAssignments((prev) => {
                              const next = prev.filter((entry) => entry.roleKey !== roleKey);
                              next.push({ roleKey, userId, userName: acolitos.find((user) => user.id === userId)?.name ?? null });
                              return next;
                            });
                          }}
                        />
                      );
                    })}
                  </div>

                  {noneAssignments.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Funcoes extras</p>
                      <div className="grid gap-3 lg:grid-cols-2">
                        {noneAssignments.map(({ entry, index }) => (
                          <AssignmentEditorCard
                            key={`NONE-${index}`}
                            roleLabel={resolveRoleLabel(NONE_ROLE_KEY)}
                            roleDescription={resolveRoleDescription(NONE_ROLE_KEY)}
                            value={entry.userId}
                            users={acolitos}
                            indexLabel={`Extra ${index + 1}`}
                            onChange={(userId) => {
                              setDraftAssignments((prev) =>
                                prev.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, userId, userName: acolitos.find((user) => user.id === userId)?.name ?? null }
                                    : item
                                )
                              );
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 border-t pt-2">
                    <Button type="button" variant="secondary" onClick={() => void autoAssignRoles()} disabled={acting}>
                      Atribuir funcoes automaticamente
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setDraftAssignments((prev) => [...prev, { roleKey: NONE_ROLE_KEY, userId: null, userName: null }])
                      }
                    >
                      Adicionar funcao extra
                    </Button>

                    <Button
                      type="button"
                      onClick={() => void callAction(`/api/masses/${id}/assign-roles`, { assignments: draftAssignments })}
                      disabled={acting}
                    >
                      Salvar funcoes
                    </Button>
                  </div>
                </>
              ) : mass.assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma funcao atribuida.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {mass.assignments.map((item, index) => (
                    <AssignmentReadOnlyCard
                      key={`${item.roleKey}-${index}`}
                      roleLabel={resolveRoleLabel(item.roleKey)}
                      roleDescription={resolveRoleDescription(item.roleKey)}
                      userLabelText={item.userId ? userLabel(item.userName, item.userId) : null}
                      isCurrentUser={item.userId === meState.me.id}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="events">
            <Card>
              <CardHeader>
                <CardTitle>Eventos</CardTitle>
                <CardDescription>Historico mais recente das mudancas da missa.</CardDescription>
              </CardHeader>
              <CardContent>
                {mass.events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
                ) : (
                  <ul className="space-y-3">
                    {recentEvents.map((event, index) => (
                      <li key={`${event.type}-${event.at}-${index}`} className="space-y-2">
                        <p className="text-sm font-medium">{event.type}</p>
                        <p className="text-sm text-muted-foreground">
                          Por {userLabel(event.actorName, event.actorId)} em {formatDateTime(event.at)}
                        </p>
                        {index < recentEvents.length - 1 && <Separator />}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isCreator && (
          <TabsContent value="admin">
            <Card>
              <CardHeader>
                <CardTitle>Delegar responsavel</CardTitle>
                <CardDescription>Somente o criador da missa pode trocar o responsavel principal.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="delegate-to">Novo responsavel (CERIMONIARIO)</Label>
                  <Select value={delegateTo} onValueChange={setDelegateTo}>
                    <SelectTrigger id="delegate-to">
                      <SelectValue placeholder="Selecione um responsavel" />
                    </SelectTrigger>
                    <SelectContent>
                      {cerimoniarios.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="button"
                  disabled={acting || !delegateTo}
                  onClick={() => void callAction(`/api/masses/${id}/delegate`, { newChiefBy: delegateTo })}
                >
                  Delegar responsavel
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={showQr} onOpenChange={setShowQr}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>QR de confirmacao</DialogTitle>
            <DialogDescription>Mostre este QR para o cerimoniario escanear e confirmar sua presenca.</DialogDescription>
          </DialogHeader>
          {qrImageUrl ? (
            <div className="space-y-3">
              <div className="flex justify-center">
                {/* External QR rendering avoids adding runtime dependencies. */}
                <img src={qrImageUrl} alt="QR de confirmacao da presenca" width={QR_SIZE} height={QR_SIZE} />
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Codigo da confirmacao</p>
                <p className="mt-1 break-all text-sm font-medium">{activeRequestId}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={async () => {
                    if (!activeRequestId) return;
                    try {
                      await navigator.clipboard.writeText(activeRequestId);
                    } catch {
                      setError("Nao foi possivel copiar o codigo.");
                    }
                  }}
                >
                  Copiar codigo
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma solicitacao pendente.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar acolitos</DialogTitle>
            <DialogDescription>Escaneie o QR do acolito e confirme ou negue a presenca.</DialogDescription>
          </DialogHeader>

          {!scanPreview ? (
            <div className="space-y-3">
              <video ref={videoRef} className="w-full rounded-md border bg-black" autoPlay muted playsInline />
              {scannerError && <p className="text-sm text-destructive">{scannerError}</p>}
              {!scannerError && <p className="text-sm text-muted-foreground">Aponte a camera para o QR do acolito.</p>}
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="manual-confirm-code">Ou informe o codigo manualmente</Label>
                <div className="flex gap-2">
                  <Input
                    id="manual-confirm-code"
                    placeholder="Cole o codigo de confirmacao"
                    value={manualRequestCode}
                    onChange={(event) => setManualRequestCode(event.target.value)}
                  />
                  <Button type="button" variant="outline" disabled={manualScanning} onClick={() => void scanByManualCode()}>
                    {manualScanning ? "Validando..." : "Validar"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">Acolito: {userLabel(scanPreview.acolito.name, scanPreview.acolito.userId)}</p>
              <p className="text-sm text-muted-foreground">
                Missa: {formatDateTime(scanPreview.mass.scheduledAt)} ({massTypeLabelByKey[scanPreview.mass.massType] ?? scanPreview.mass.massType})
              </p>
            </div>
          )}

          <DialogFooter>
            {!scanPreview && (
              <Button type="button" disabled={scanningFrame} onClick={() => void scanQrFrame()}>
                {scanningFrame ? "Lendo..." : "Capturar QR"}
              </Button>
            )}
            {scanPreview && (
              <>
                <Button type="button" variant="destructive" disabled={reviewing} onClick={() => void reviewScannedAcolito("deny")}>
                  Negar
                </Button>
                <Button type="button" disabled={reviewing} onClick={() => void reviewScannedAcolito("confirm")}>
                  Confirmar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function SummaryDetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 rounded-md border bg-background p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function PresenceMetricItem({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className={`rounded-md border p-3 dark:backdrop-blur-[1px] ${className}`}>
      <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-none">{value}</p>
    </div>
  );
}

function AssignmentEditorCard({
  roleLabel,
  roleDescription,
  value,
  users,
  indexLabel,
  onChange,
}: {
  roleLabel: string;
  roleDescription: string;
  value: string | null;
  users: UserOption[];
  indexLabel?: string;
  onChange: (userId: string | null) => void;
}) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="mb-2 space-y-1">
        <p className="text-sm font-semibold">{indexLabel ?? roleLabel}</p>
        {indexLabel ? <p className="text-xs text-muted-foreground">{roleLabel}</p> : null}
        <p className="text-xs text-muted-foreground">{roleDescription}</p>
      </div>
      <Select value={value ?? VACANT_VALUE} onValueChange={(selected) => onChange(selected === VACANT_VALUE ? null : selected)}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione um acolito" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={VACANT_VALUE}>vago</SelectItem>
          {users.map((user) => (
            <SelectItem key={user.id} value={user.id}>
              {user.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function AssignmentReadOnlyCard({
  roleLabel,
  roleDescription,
  userLabelText,
  isCurrentUser,
}: {
  roleLabel: string;
  roleDescription: string;
  userLabelText: string | null;
  isCurrentUser: boolean;
}) {
  return (
    <Card className={isCurrentUser ? "border-primary/60 bg-primary/5" : undefined}>
      <CardContent className="space-y-1 pt-6">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{roleLabel}</p>
          {isCurrentUser ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
              Voce
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{roleDescription}</p>
        <p className={`text-sm ${userLabelText ? "text-foreground" : "text-muted-foreground/70 italic"}`}>{userLabelText ?? "vago"}</p>
      </CardContent>
    </Card>
  );
}

function MassDetailSkeleton() {
  return (
    <main className="min-h-screen space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-56" />
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    </main>
  );
}

