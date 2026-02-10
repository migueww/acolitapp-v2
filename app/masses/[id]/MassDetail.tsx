"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useMe } from "@/hooks/use-me";
import { ApiClientError, apiFetch } from "@/lib/api";
import { formatDateTime, statusLabel } from "@/lib/mass-ui";

type Entry = { userId: string; joinedAt?: string; confirmedAt?: string };
type Assignment = { roleKey: string; userId: string | null };
type Event = { type: string; actorId: string; at: string };

type MassDetailResponse = {
  id: string;
  status: string;
  massType: "SIMPLES" | "SOLENE" | "PALAVRA";
  scheduledAt: string;
  chiefBy: string;
  createdBy: string;
  attendance: { joined: Entry[]; confirmed: Entry[] };
  assignments: Assignment[];
  events: Event[];
};

type TemplateResponse = Record<"SIMPLES" | "SOLENE" | "PALAVRA", string[]>;
type UserResponse = { items: { id: string; name: string }[] };

export function MassDetail({ id }: { id: string }) {
  const router = useRouter();
  const meState = useMe();
  const [mass, setMass] = React.useState<MassDetailResponse | null>(null);
  const [templates, setTemplates] = React.useState<TemplateResponse | null>(null);
  const [users, setUsers] = React.useState<{ id: string; name: string }[]>([]);
  const [draftAssignments, setDraftAssignments] = React.useState<Assignment[]>([]);
  const [delegateTo, setDelegateTo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const massData = await apiFetch<MassDetailResponse>(`/api/masses/${id}`);
      setMass(massData);

      if (massData.status === "PREPARATION") {
        const [templateData, usersData] = await Promise.all([
          apiFetch<TemplateResponse>("/api/masses/role-templates"),
          apiFetch<UserResponse>("/api/users?role=ACOLITO&active=true"),
        ]);
        setTemplates(templateData);
        setUsers(usersData.items);
        setDraftAssignments(massData.assignments);
      }
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Erro ao carregar missa");
    }
  }, [id, router]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const callAction = async (path: string, body?: unknown) => {
    try {
      await apiFetch<{ ok: boolean }>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
      await load();
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setError(e instanceof Error ? e.message : "Erro de ação");
    }
  };

  if (meState.status === "loading" || !mass) return <main className="p-8">Carregando...</main>;
  if (meState.status === "loggedOut") return null;

  const isAdmin = meState.me.role === "CERIMONIARIO";
  const isCreator = mass.createdBy === meState.me.id;
  const canAdminThisMass = isAdmin && (isCreator || mass.chiefBy === meState.me.id);
  const hasConfirmed = mass.attendance.confirmed.some((entry) => entry.userId === meState.me.id);

  const templateRoles = templates?.[mass.massType] ?? [];
  const fixedRoles = templateRoles.filter((role) => role !== "NONE");
  const noneAssignments = draftAssignments.filter((entry) => entry.roleKey === "NONE");

  return (
    <main className="p-8 space-y-4">
      <h1 className="text-2xl font-semibold">Detalhe da missa</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <p>Data: {formatDateTime(mass.scheduledAt)}</p>
      <p>Status: {statusLabel[mass.status] ?? mass.status}</p>
      <p>Tipo: {mass.massType}</p>
      <p>createdBy: {mass.createdBy}</p>
      <p>chiefBy: {mass.chiefBy}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="border p-3">
          <h2 className="font-medium">Joined ({mass.attendance.joined.length})</h2>
          <ul>{mass.attendance.joined.map((entry) => <li key={entry.userId}>{entry.userId}</li>)}</ul>
        </div>
        <div className="border p-3">
          <h2 className="font-medium">Confirmed ({mass.attendance.confirmed.length})</h2>
          <ul>{mass.attendance.confirmed.map((entry) => <li key={entry.userId}>{entry.userId}</li>)}</ul>
        </div>
      </div>

      <div className="space-x-2">
        {canAdminThisMass && mass.status === "SCHEDULED" && (
          <>
            <button className="border px-3 py-1" onClick={() => void callAction(`/api/masses/${id}/open`)} type="button">OPEN</button>
            <button className="border px-3 py-1" onClick={() => void callAction(`/api/masses/${id}/cancel`)} type="button">CANCEL</button>
          </>
        )}
        {canAdminThisMass && mass.status === "OPEN" && (
          <>
            <button className="border px-3 py-1" onClick={() => void callAction(`/api/masses/${id}/preparation`)} type="button">PREPARATION</button>
            <button className="border px-3 py-1" onClick={() => void callAction(`/api/masses/${id}/cancel`)} type="button">CANCEL</button>
          </>
        )}
        {canAdminThisMass && mass.status === "PREPARATION" && (
          <button className="border px-3 py-1" onClick={() => void callAction(`/api/masses/${id}/finish`)} type="button">FINISH</button>
        )}

        {!isAdmin && mass.status === "OPEN" && !hasConfirmed && (
          <>
            <button className="border px-3 py-1" onClick={() => void callAction(`/api/masses/${id}/join`)} type="button">JOIN</button>
            <button className="border px-3 py-1" onClick={() => void callAction(`/api/masses/${id}/confirm`)} type="button">CONFIRM</button>
          </>
        )}
        {!isAdmin && hasConfirmed && <span>Confirmado ✅</span>}
      </div>

      {isCreator && (
        <div className="space-y-2 border p-3">
          <h2 className="font-medium">Delegar chief</h2>
          <input className="border p-2" placeholder="ID do novo chief" value={delegateTo} onChange={(e) => setDelegateTo(e.target.value)} />
          <button className="border px-3 py-1" type="button" onClick={() => void callAction(`/api/masses/${id}/delegate`, { newChiefBy: delegateTo })}>DELEGATE</button>
        </div>
      )}

      <div className="border p-3 space-y-2">
        <h2 className="font-medium">Assignments</h2>
        {mass.status === "PREPARATION" && canAdminThisMass && templates ? (
          <>
            {fixedRoles.map((roleKey) => {
              const current = draftAssignments.find((entry) => entry.roleKey === roleKey) ?? { roleKey, userId: null };
              return (
                <AssignmentRow
                  key={roleKey}
                  roleKey={roleKey}
                  value={current.userId}
                  users={users}
                  onChange={(userId) => {
                    setDraftAssignments((prev) => {
                      const next = prev.filter((entry) => entry.roleKey !== roleKey);
                      next.push({ roleKey, userId });
                      return next;
                    });
                  }}
                />
              );
            })}

            {noneAssignments.map((entry, index) => (
              <AssignmentRow
                key={`NONE-${index}`}
                roleKey="NONE"
                value={entry.userId}
                users={users}
                onChange={(userId) => {
                  setDraftAssignments((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, userId } : item)));
                }}
              />
            ))}

            <button className="border px-3 py-1" type="button" onClick={() => setDraftAssignments((prev) => [...prev, { roleKey: "NONE", userId: null }])}>
              Adicionar NONE
            </button>

            <button className="border px-3 py-1" type="button" onClick={() => void callAction(`/api/masses/${id}/assign-roles`, { assignments: draftAssignments })}>
              ASSIGN ROLES
            </button>
          </>
        ) : (
          <ul className="list-disc ml-5">
            {mass.assignments.map((item, index) => (
              <li key={`${item.roleKey}-${index}`}>
                {item.roleKey}: {item.userId ?? "(vago)"}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border p-3">
        <h2 className="font-medium">Últimos eventos</h2>
        <ul className="list-disc ml-5">
          {mass.events.slice(-10).reverse().map((event, index) => (
            <li key={`${event.type}-${index}`}>
              {event.type} por {event.actorId} em {formatDateTime(event.at)}
            </li>
          ))}
        </ul>
      </div>
    </main>
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
  users: { id: string; name: string }[];
  onChange: (userId: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-56">{roleKey}</span>
      <select className="border p-2" value={value ?? ""} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">(vago)</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </select>
    </div>
  );
}
