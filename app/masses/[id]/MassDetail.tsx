"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useMe } from "@/hooks/use-me";
import { ApiClientError, apiFetch } from "@/lib/api";
import { formatDateTime, statusLabel } from "@/lib/mass-ui";
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
import { LogoutButton } from "@/components/logout-button";
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

type MassDetailResponse = {
  id: string;
  status: string;
  massType: "SIMPLES" | "SOLENE" | "PALAVRA";
  scheduledAt: string;
  chiefBy: string;
  chiefByName: string | null;
  createdBy: string;
  createdByName: string | null;
  attendance: { joined: Entry[]; confirmed: Entry[]; pending: PendingEntry[] };
  assignments: Assignment[];
  events: Event[];
};

type TemplateResponse = Record<"SIMPLES" | "SOLENE" | "PALAVRA", string[]>;
type UserResponse = { items: UserOption[] };
type ConfirmRequestResponse = { ok: true; requestId: string; qrPayload: string };
type ConfirmScanResponse = {
  ok: true;
  requestId: string;
  acolito: { userId: string; name: string | null };
  mass: { id: string; scheduledAt: string; massType: string; chiefByName: string | null; createdByName: string | null };
};

const NONE_ROLE_KEY = "NONE";
const VACANT_VALUE = "__VACANT__";
const SHORT_ID_HEAD = 6;
const SHORT_ID_TAIL = 4;
const QR_SIZE = 320;
const SCAN_INTERVAL_MS = 700;
const MAX_CONSECUTIVE_SCAN_ERRORS = 6;

const shortenId = (id: string): string => `${id.slice(0, SHORT_ID_HEAD)}...${id.slice(-SHORT_ID_TAIL)}`;
const userLabel = (name: string | null, id: string | null): string => {
  if (name) return name;
  if (!id) return "Usuario nao encontrado";
  return `Usuario nao encontrado (${shortenId(id)})`;
};
const buildQrPayload = (massId: string, requestId: string): string =>
  JSON.stringify({ type: "MASS_CONFIRMATION", massId, requestId });

export function MassDetail({ id }: { id: string }) {
  const router = useRouter();
  const meState = useMe();

  const [mass, setMass] = React.useState<MassDetailResponse | null>(null);
  const [templates, setTemplates] = React.useState<TemplateResponse | null>(null);
  const [acolitos, setAcolitos] = React.useState<UserOption[]>([]);
  const [cerimoniarios, setCerimoniarios] = React.useState<UserOption[]>([]);
  const [draftAssignments, setDraftAssignments] = React.useState<Assignment[]>([]);
  const [delegateTo, setDelegateTo] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [acting, setActing] = React.useState(false);
  const [qrRequestId, setQrRequestId] = React.useState<string | null>(null);
  const [showQr, setShowQr] = React.useState(false);
  const [scannerOpen, setScannerOpen] = React.useState(false);
  const [scannerError, setScannerError] = React.useState<string | null>(null);
  const [scanPreview, setScanPreview] = React.useState<ConfirmScanResponse | null>(null);
  const [reviewing, setReviewing] = React.useState(false);

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const scanIntervalRef = React.useRef<number | null>(null);
  const scanBusyRef = React.useRef(false);
  const scanCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const consecutiveScanErrorsRef = React.useRef(0);

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

  const stopScanner = React.useCallback(() => {
    if (scanIntervalRef.current !== null) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    scanBusyRef.current = false;
    consecutiveScanErrorsRef.current = 0;
  }, []);

  const startScanner = React.useCallback(async () => {
    stopScanner();
    setScannerError(null);
    setScanPreview(null);
    consecutiveScanErrorsRef.current = 0;

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

      const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });

      scanIntervalRef.current = window.setInterval(async () => {
        if (!videoRef.current || scanBusyRef.current) return;
        if (videoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

        scanBusyRef.current = true;
        try {
          const video = videoRef.current;
          const frameWidth = video.videoWidth;
          const frameHeight = video.videoHeight;

          if (!frameWidth || !frameHeight) return;

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
            throw new Error("Nao foi possivel processar os frames da camera.");
          }

          context.drawImage(video, 0, 0, frameWidth, frameHeight);
          const codes = await detector.detect(canvas);
          const value = codes[0]?.rawValue;
          if (!value) return;

          const preview = await apiFetch<ConfirmScanResponse>(`/api/masses/${id}/confirm/scan`, {
            method: "POST",
            body: JSON.stringify({ qrPayload: value }),
          });
          setScanPreview(preview);
          setScannerError(null);
          stopScanner();
        } catch (e) {
          if (e instanceof ApiClientError) {
            setScannerError(e.message);
            return;
          }

          consecutiveScanErrorsRef.current += 1;
          if (consecutiveScanErrorsRef.current >= MAX_CONSECUTIVE_SCAN_ERRORS) {
            setScannerError("Nao foi possivel ler o QR nesta camera. Tente ajustar foco/distancia ou use Chrome/Edge atualizado.");
          }
        } finally {
          scanBusyRef.current = false;
        }
      }, SCAN_INTERVAL_MS);
    } catch (e) {
      setScannerError(e instanceof Error ? e.message : "Nao foi possivel abrir a camera.");
    }
  }, [id, stopScanner]);

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
      const response = await apiFetch<ConfirmRequestResponse>(`/api/masses/${id}/confirm/request`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setQrRequestId(response.requestId);
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
      setError(e instanceof Error ? e.message : "Erro ao revisar confirmação");
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
  const activeRequestId = myPending?.requestId ?? qrRequestId;
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

  return (
    <main className="min-h-screen space-y-6 p-6 md:p-8">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Detalhe da missa</h1>
          <LogoutButton />
        </div>
        <p className="text-sm text-muted-foreground">Visualize presenca, escala e historico de eventos.</p>
      </header>

      {error && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Resumo</CardTitle>
          <CardDescription>Informacoes principais da celebracao.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <SummaryItem label="Data" value={formatDateTime(mass.scheduledAt)} />
          <SummaryItem label="Status" value={statusLabel[mass.status] ?? mass.status} />
          <SummaryItem label="Tipo" value={mass.massType} />
          <SummaryItem label="Criado por" value={userLabel(mass.createdByName, mass.createdBy)} />
          <SummaryItem label="Responsavel" value={userLabel(mass.chiefByName, mass.chiefBy)} />
          <SummaryItem label="Confirmados" value={String(mass.attendance.confirmed.length)} />
          <SummaryItem label="Pendentes" value={String(mass.attendance.pending.length)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acoes</CardTitle>
          <CardDescription>Acoes permitidas para o seu perfil no status atual.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {canAdminThisMass && mass.status === "SCHEDULED" && (
            <>
              <Button type="button" onClick={() => void callAction(`/api/masses/${id}/open`)} disabled={acting}>
                OPEN
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void callAction(`/api/masses/${id}/cancel`)}
                disabled={acting}
              >
                CANCEL
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
                PREPARATION
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void callAction(`/api/masses/${id}/cancel`)}
                disabled={acting}
              >
                CANCEL
              </Button>
              <Button type="button" variant="outline" onClick={() => setScannerOpen(true)} disabled={acting}>
                CONFIRMAR ACOLITOS
              </Button>
            </>
          )}

          {canAdminThisMass && mass.status === "PREPARATION" && (
            <Button type="button" onClick={() => void callAction(`/api/masses/${id}/finish`)} disabled={acting}>
              FINISH
            </Button>
          )}

          {!isAdmin && mass.status === "OPEN" && !hasConfirmed && !hasJoined && (
            <Button type="button" variant="outline" onClick={() => void callAction(`/api/masses/${id}/join`)} disabled={acting}>
              PARTICIPAR
            </Button>
          )}

          {!isAdmin && mass.status === "OPEN" && !hasConfirmed && hasJoined && !myPending && (
            <Button type="button" onClick={() => void requestConfirmation()} disabled={acting}>
              CONFIRMAR PRESENCA
            </Button>
          )}

          {!isAdmin && mass.status === "OPEN" && !hasConfirmed && hasJoined && myPending && (
            <>
              <Button type="button" variant="outline" onClick={() => setShowQr(true)} disabled={acting}>
                EXIBIR QR CODE
              </Button>
              <p className="text-sm text-muted-foreground">Aguardando validacao do cerimoniario.</p>
            </>
          )}

          {!isAdmin && hasConfirmed && <p className="text-sm text-muted-foreground">Presenca confirmada.</p>}
        </CardContent>
      </Card>

      <Tabs defaultValue="attendance" className="space-y-4">
        <TabsList className={`grid w-full ${isCreator ? "grid-cols-4" : "grid-cols-3"}`}>
          <TabsTrigger value="attendance">Presenca</TabsTrigger>
          <TabsTrigger value="assignments">Escala</TabsTrigger>
          <TabsTrigger value="events">Eventos</TabsTrigger>
          {isCreator && <TabsTrigger value="admin">Admin</TabsTrigger>}
        </TabsList>

        <TabsContent value="attendance">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Joined ({mass.attendance.joined.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {mass.attendance.joined.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum registro.</p>
                ) : (
                  <ul className="space-y-2">
                    {mass.attendance.joined.map((entry) => (
                      <li key={`${entry.userId}-${entry.joinedAt ?? ""}`} className="text-sm">
                        <p>{userLabel(entry.userName, entry.userId)}</p>
                        {entry.joinedAt && (
                          <p className="text-xs text-muted-foreground">{formatDateTime(entry.joinedAt)}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Confirmed ({mass.attendance.confirmed.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {mass.attendance.confirmed.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum registro.</p>
                ) : (
                  <ul className="space-y-2">
                    {mass.attendance.confirmed.map((entry) => (
                      <li key={`${entry.userId}-${entry.confirmedAt ?? ""}`} className="text-sm">
                        <p>{userLabel(entry.userName, entry.userId)}</p>
                        {entry.confirmedAt && (
                          <p className="text-xs text-muted-foreground">{formatDateTime(entry.confirmedAt)}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pending ({mass.attendance.pending.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {mass.attendance.pending.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum registro.</p>
                ) : (
                  <ul className="space-y-2">
                    {mass.attendance.pending.map((entry) => (
                      <li key={entry.requestId} className="text-sm">
                        <p>{userLabel(entry.userName, entry.userId)}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(entry.requestedAt)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="assignments">
          <Card>
            <CardHeader>
              <CardTitle>Escala</CardTitle>
              <CardDescription>
                {mass.status === "PREPARATION" && canAdminThisMass
                  ? "Atualize os papeis para a celebracao."
                  : "Escala atual da missa."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mass.status === "PREPARATION" && canAdminThisMass && templates ? (
                <>
                  {fixedRoles.map((roleKey) => {
                    const current = draftAssignments.find((entry) => entry.roleKey === roleKey) ?? {
                      roleKey,
                      userId: null,
                      userName: null,
                    };
                    return (
                      <AssignmentRow
                        key={roleKey}
                        roleKey={roleKey}
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

                  {noneAssignments.map(({ entry, index }) => (
                    <AssignmentRow
                      key={`NONE-${index}`}
                      roleKey={NONE_ROLE_KEY}
                      value={entry.userId}
                      users={acolitos}
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

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setDraftAssignments((prev) => [...prev, { roleKey: NONE_ROLE_KEY, userId: null, userName: null }])
                      }
                    >
                      Adicionar NONE
                    </Button>

                    <Button
                      type="button"
                      onClick={() => void callAction(`/api/masses/${id}/assign-roles`, { assignments: draftAssignments })}
                      disabled={acting}
                    >
                      ASSIGN ROLES
                    </Button>
                  </div>
                </>
              ) : mass.assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum papel atribuido.</p>
              ) : (
                <div className="grid gap-3">
                  {mass.assignments.map((item, index) => (
                    <Card key={`${item.roleKey}-${index}`}>
                      <CardContent className="pt-6">
                        <p className="text-sm font-medium">{item.roleKey}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.userId ? userLabel(item.userName, item.userId) : "(vago)"}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

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
                  DELEGATE
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
            <div className="flex justify-center">
              {/* External QR rendering avoids adding runtime dependencies. */}
              <img src={qrImageUrl} alt="QR de confirmacao da presenca" width={QR_SIZE} height={QR_SIZE} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma solicitacao pendente.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar acólitos</DialogTitle>
            <DialogDescription>Escaneie o QR do acólito e confirme ou negue a presença.</DialogDescription>
          </DialogHeader>

          {!scanPreview ? (
            <div className="space-y-3">
              <video ref={videoRef} className="w-full rounded-md border bg-black" autoPlay muted playsInline />
              {scannerError && <p className="text-sm text-destructive">{scannerError}</p>}
              {!scannerError && <p className="text-sm text-muted-foreground">Aponte a camera para o QR do acólito.</p>}
            </div>
          ) : (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">Acólito: {userLabel(scanPreview.acolito.name, scanPreview.acolito.userId)}</p>
              <p className="text-sm text-muted-foreground">Missa: {formatDateTime(scanPreview.mass.scheduledAt)} ({scanPreview.mass.massType})</p>
            </div>
          )}

          <DialogFooter>
            {scanPreview && (
              <>
                <Button type="button" variant="destructive" disabled={reviewing} onClick={() => void reviewScannedAcolito("deny")}>
                  NEGAR
                </Button>
                <Button type="button" disabled={reviewing} onClick={() => void reviewScannedAcolito("confirm")}>
                  CONFIRMAR
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 rounded-md border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function AssignmentRow({
  roleKey,
  value,
  users,
  onChange,
}: {
  roleKey: string;
  value: string | null;
  users: UserOption[];
  onChange: (userId: string | null) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-[minmax(0,220px)_1fr] md:items-center">
      <p className="text-sm font-medium">{roleKey}</p>
      <Select value={value ?? VACANT_VALUE} onValueChange={(selected) => onChange(selected === VACANT_VALUE ? null : selected)}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione um acolito" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={VACANT_VALUE}>(vago)</SelectItem>
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
