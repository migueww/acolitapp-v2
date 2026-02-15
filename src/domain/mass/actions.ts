import { randomUUID } from "node:crypto";

import { getMongoose } from "@/lib/mongoose";
import { getMassModel, type AssignmentEntry, type MassDocument } from "@/models/Mass";
import { getUserModel } from "@/models/User";
import { getMassTypeConfig, getMassTypeTemplateRoleKeys, getRoleWeightMap } from "@/src/domain/liturgy/service";

import { ConflictError, NotFoundError } from "@/src/domain/mass/errors";
import { assertAcolitoRole, assertCerimoniarioRole } from "@/src/domain/mass/guards";
import { type ActionType, type Actor, type EventPayload, type MassStatus } from "@/src/domain/mass/types";

type AdminActionInput = {
  massId: string;
  actor: Actor;
};

type DelegateActionInput = AdminActionInput & {
  newChiefBy: string;
};

type AssignRolesActionInput = AdminActionInput & {
  assignments: Array<AssignmentEntry>;
};

type AcolitoActionInput = {
  massId: string;
  actor: Actor;
};

type ReviewConfirmationInput = AdminActionInput & {
  requestId: string;
  decision: "confirm" | "deny";
};

const toObjectId = (id: string) => {
  const mongoose = getMongoose();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new NotFoundError("Missa nÃ£o encontrada");
  }

  return new mongoose.Types.ObjectId(id);
};

const getMassById = async (massId: string): Promise<MassDocument | null> => {
  const mass = await getMassModel().findById(toObjectId(massId)).lean();
  return mass as MassDocument | null;
};

const LEGACY_STATUS_ALIASES: Record<MassStatus, string[]> = {
  SCHEDULED: ["AGENDADA"],
  OPEN: ["ABERTA", "ABERTO"],
  PREPARATION: ["PREPARACAO", "PREPARAÇÃO"],
  FINISHED: ["FINALIZADA", "FINALIZADO"],
  CANCELED: ["CANCELADA", "CANCELADO"],
};

const normalizeMassStatus = (rawStatus: unknown): MassStatus | null => {
  if (typeof rawStatus !== "string") return null;

  const status = rawStatus.trim().toUpperCase();
  if (status === "SCHEDULED") return "SCHEDULED";
  if (status === "OPEN") return "OPEN";
  if (status === "PREPARATION") return "PREPARATION";
  if (status === "FINISHED") return "FINISHED";
  if (status === "CANCELED") return "CANCELED";

  for (const [canonical, aliases] of Object.entries(LEGACY_STATUS_ALIASES) as Array<[MassStatus, string[]]>) {
    if (aliases.includes(status)) return canonical;
  }

  return null;
};

const buildStatusSet = (statuses: MassStatus[]): string[] => {
  const result = new Set<string>();
  for (const status of statuses) {
    result.add(status);
    result.add(status.toLowerCase());

    for (const alias of LEGACY_STATUS_ALIASES[status]) {
      result.add(alias);
      result.add(alias.toLowerCase());
    }
  }
  return Array.from(result);
};

const checkAllowedStatus = (mass: MassDocument, allowedStatuses: MassStatus[]): void => {
  const normalizedStatus = normalizeMassStatus(mass.status);
  if (!normalizedStatus || !allowedStatuses.includes(normalizedStatus)) {
    throw new ConflictError(`AÃ§Ã£o nÃ£o permitida no status ${String(mass.status)}`);
  }
};

const assertCanAdminister = (mass: MassDocument, actorId: string): void => {
  if (![mass.createdBy.toString(), mass.chiefBy.toString()].includes(actorId)) {
    throw new NotFoundError("Missa nÃ£o encontrada");
  }
};

const asMassDocument = (value: unknown): MassDocument => value as MassDocument;

const appendEventPipelineStage = (eventType: ActionType, actorObjectId: ReturnType<typeof toObjectId>, payload?: EventPayload) => ({
  events: {
    $concatArrays: [
      "$events",
      [
        {
          type: eventType,
          actorId: actorObjectId,
          at: "$$NOW",
          ...(payload ? { payload } : {}),
        },
      ],
    ],
  },
});

const DEFAULT_GLOBAL_SCORE = 50;
const MIN_GLOBAL_SCORE = 0;
const MAX_GLOBAL_SCORE = 100;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
const normalizeGlobalScore = (value: unknown): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_GLOBAL_SCORE;
  }

  return clamp(Math.round(value), MIN_GLOBAL_SCORE, MAX_GLOBAL_SCORE);
};

const buildPriorityOrderedRoleKeys = async (massType: MassDocument["massType"]): Promise<string[]> => {
  const templateRoleKeys = (await getMassTypeTemplateRoleKeys(massType)).filter((roleKey) => roleKey !== "NONE");
  const roleWeightMap = await getRoleWeightMap(templateRoleKeys);

  return templateRoleKeys.sort((roleA, roleB) => {
    const weightDiff = (roleWeightMap.get(roleB) ?? 0) - (roleWeightMap.get(roleA) ?? 0);
    if (weightDiff !== 0) {
      return weightDiff;
    }
    return roleA.localeCompare(roleB);
  });
};

export async function openMassAction({ massId, actor }: AdminActionInput): Promise<MassDocument> {
  assertCerimoniarioRole(actor);

  const actorObjectId = toObjectId(actor.userId);
  const massObjectId = toObjectId(massId);

  const updated = await getMassModel()
    .findOneAndUpdate(
      {
        _id: massObjectId,
        status: { $in: buildStatusSet(["SCHEDULED"]) },
        $or: [{ createdBy: actorObjectId }, { chiefBy: actorObjectId }],
      },
      {
        $set: { status: "OPEN", openedAt: new Date() },
        $push: {
          events: {
            type: "MASS_OPENED",
            actorId: actorObjectId,
            at: new Date(),
          },
        },
      },
      { new: true }
    )
    .lean();

  if (updated) {
    return asMassDocument(updated);
  }

  const mass = await getMassById(massId);
  if (!mass) {
    throw new NotFoundError("Missa nÃ£o encontrada");
  }

  assertCanAdminister(mass, actor.userId);
  checkAllowedStatus(mass, ["SCHEDULED"]);
  throw new ConflictError("A missa nÃ£o pÃ´de ser aberta por concorrÃªncia");
}

export async function moveMassToPreparationAction({ massId, actor }: AdminActionInput): Promise<MassDocument> {
  assertCerimoniarioRole(actor);

  const actorObjectId = toObjectId(actor.userId);
  const massObjectId = toObjectId(massId);

  const updated = await getMassModel()
    .findOneAndUpdate(
      {
        _id: massObjectId,
        status: { $in: buildStatusSet(["OPEN"]) },
        $or: [{ createdBy: actorObjectId }, { chiefBy: actorObjectId }],
      },
      [
        {
          $set: {
            __confirmedIds: {
              $map: {
                input: "$attendance.confirmed",
                as: "confirmedEntry",
                in: "$$confirmedEntry.userId",
              },
            },
          },
        },
        {
          $set: {
            __newJoined: {
              $filter: {
                input: "$attendance.joined",
                as: "joinedEntry",
                cond: { $in: ["$$joinedEntry.userId", "$__confirmedIds"] },
              },
            },
          },
        },
        {
          $set: {
            __removedCount: {
              $subtract: [{ $size: "$attendance.joined" }, { $size: "$__newJoined" }],
            },
            __removedPendingCount: { $size: "$attendance.pending" },
            status: "PREPARATION",
            preparationAt: "$$NOW",
            "attendance.joined": "$__newJoined",
            "attendance.pending": [],
            ...appendEventPipelineStage("MASS_MOVED_TO_PREPARATION", actorObjectId, {
              removedJoinedCount: { $subtract: [{ $size: "$attendance.joined" }, { $size: "$__newJoined" }] },
              removedPendingCount: { $size: "$attendance.pending" },
            }),
          },
        },
        {
          $unset: ["__confirmedIds", "__newJoined", "__removedCount", "__removedPendingCount"],
        },
      ],
      { new: true }
    )
    .lean();

  if (updated) {
    return asMassDocument(updated);
  }

  const mass = await getMassById(massId);
  if (!mass) {
    throw new NotFoundError("Missa nÃ£o encontrada");
  }

  assertCanAdminister(mass, actor.userId);
  checkAllowedStatus(mass, ["OPEN"]);
  throw new ConflictError("A missa nÃ£o pÃ´de ser movida para preparaÃ§Ã£o por concorrÃªncia");
}

export async function finishMassAction({ massId, actor }: AdminActionInput): Promise<MassDocument> {
  assertCerimoniarioRole(actor);

  const actorObjectId = toObjectId(actor.userId);
  const massObjectId = toObjectId(massId);
  const currentMass = await getMassById(massId);
  if (!currentMass) {
    throw new NotFoundError("Missa não encontrada");
  }

  assertCanAdminister(currentMass, actor.userId);
  checkAllowedStatus(currentMass, ["PREPARATION"]);

  const fallbackAssignments: AssignmentEntry[] = (await getMassTypeTemplateRoleKeys(currentMass.massType)).map((roleKey) => ({
    roleKey,
    userId: null,
  }));

  const updated = await getMassModel()
    .findOneAndUpdate(
      {
        _id: massObjectId,
        status: { $in: buildStatusSet(["PREPARATION"]) },
        $or: [{ createdBy: actorObjectId }, { chiefBy: actorObjectId }],
      },
      [
        {
          $set: {
            status: "FINISHED",
            finishedAt: "$$NOW",
            assignments: {
              $cond: {
                if: { $gt: [{ $size: "$assignments" }, 0] },
                then: "$assignments",
                else: fallbackAssignments,
              },
            },
            ...appendEventPipelineStage("MASS_FINISHED", actorObjectId),
          },
        },
      ],
      { new: true }
    )
    .lean();

  if (updated) {
    return asMassDocument(updated);
  }

  const mass = await getMassById(massId);
  if (!mass) {
    throw new NotFoundError("Missa não encontrada");
  }

  assertCanAdminister(mass, actor.userId);
  checkAllowedStatus(mass, ["PREPARATION"]);
  throw new ConflictError("A missa não pôde ser finalizada por concorrência");
}

export async function cancelMassAction({ massId, actor }: AdminActionInput): Promise<MassDocument> {
  assertCerimoniarioRole(actor);

  const actorObjectId = toObjectId(actor.userId);
  const massObjectId = toObjectId(massId);

  const updated = await getMassModel()
    .findOneAndUpdate(
      {
        _id: massObjectId,
        status: { $in: buildStatusSet(["SCHEDULED", "OPEN"]) },
        $or: [{ createdBy: actorObjectId }, { chiefBy: actorObjectId }],
      },
      {
        $set: { status: "CANCELED", canceledAt: new Date() },
        $push: {
          events: {
            type: "MASS_CANCELED",
            actorId: actorObjectId,
            at: new Date(),
          },
        },
      },
      { new: true }
    )
    .lean();

  if (updated) {
    return asMassDocument(updated);
  }

  const mass = await getMassById(massId);
  if (!mass) {
    throw new NotFoundError("Missa nÃ£o encontrada");
  }

  assertCanAdminister(mass, actor.userId);
  checkAllowedStatus(mass, ["SCHEDULED", "OPEN"]);
  throw new ConflictError("A missa nÃ£o pÃ´de ser cancelada por concorrÃªncia");
}

export async function delegateMassAction({ massId, actor, newChiefBy }: DelegateActionInput): Promise<MassDocument> {
  assertCerimoniarioRole(actor);

  const actorObjectId = toObjectId(actor.userId);
  const massObjectId = toObjectId(massId);
  const newChiefByObjectId = toObjectId(newChiefBy);

  const updated = await getMassModel()
    .findOneAndUpdate(
      {
        _id: massObjectId,
        createdBy: actorObjectId,
        status: { $nin: buildStatusSet(["FINISHED", "CANCELED"]) },
      },
      {
        $set: { chiefBy: newChiefByObjectId },
        $push: {
          events: {
            type: "MASS_DELEGATED",
            actorId: actorObjectId,
            at: new Date(),
            payload: { newChiefBy: newChiefByObjectId },
          },
        },
      },
      { new: true }
    )
    .lean();

  if (updated) {
    return asMassDocument(updated);
  }

  const mass = await getMassById(massId);
  if (!mass) {
    throw new NotFoundError("Missa nÃ£o encontrada");
  }

  if (mass.createdBy.toString() !== actor.userId) {
    throw new NotFoundError("Missa nÃ£o encontrada");
  }

  checkAllowedStatus(mass, ["SCHEDULED", "OPEN", "PREPARATION"]);
  throw new ConflictError("A missa nÃ£o pÃ´de ser delegada por concorrÃªncia");
}

export async function assignRolesMassAction({ massId, actor, assignments }: AssignRolesActionInput): Promise<MassDocument> {
  assertCerimoniarioRole(actor);

  const actorObjectId = toObjectId(actor.userId);
  const massObjectId = toObjectId(massId);

  const updated = await getMassModel()
    .findOneAndUpdate(
      {
        _id: massObjectId,
        status: { $in: buildStatusSet(["PREPARATION"]) },
        $or: [{ createdBy: actorObjectId }, { chiefBy: actorObjectId }],
      },
      {
        $set: { assignments },
        $push: {
          events: {
            type: "MASS_ASSIGNMENTS_UPDATED",
            actorId: actorObjectId,
            at: new Date(),
            payload: { assignmentsCount: assignments.length },
          },
        },
      },
      { new: true }
    )
    .lean();

  if (updated) {
    return asMassDocument(updated);
  }

  const mass = await getMassById(massId);
  if (!mass) {
    throw new NotFoundError("Missa nÃ£o encontrada");
  }

  assertCanAdminister(mass, actor.userId);
  checkAllowedStatus(mass, ["PREPARATION"]);
  throw new ConflictError("As funÃ§Ãµes nÃ£o puderam ser atribuÃ­das por concorrÃªncia");
}

export async function autoAssignRolesMassAction({ massId, actor }: AdminActionInput): Promise<Array<AssignmentEntry>> {
  assertCerimoniarioRole(actor);

  const mass = await getMassById(massId);
  if (!mass) {
    throw new NotFoundError("Missa nao encontrada");
  }

  assertCanAdminister(mass, actor.userId);
  checkAllowedStatus(mass, ["PREPARATION"]);

  const massTypeConfig = await getMassTypeConfig(mass.massType);
  const sortedRoleKeys = await buildPriorityOrderedRoleKeys(mass.massType);
  const confirmedEntries = [...(mass.attendance?.confirmed ?? [])]
    .sort((entryA, entryB) => {
      const timeA = entryA.confirmedAt ? new Date(entryA.confirmedAt).getTime() : 0;
      const timeB = entryB.confirmedAt ? new Date(entryB.confirmedAt).getTime() : 0;
      if (timeA !== timeB) {
        return timeA - timeB;
      }
      return entryA.userId.toString().localeCompare(entryB.userId.toString());
    })
    .reduce<
      Array<{
        userId: string;
        userObjectId: NonNullable<AssignmentEntry["userId"]>;
        confirmedAt: Date;
      }>
    >((accumulator, entry) => {
      const userId = entry.userId.toString();
      if (accumulator.some((current) => current.userId === userId)) {
        return accumulator;
      }

      accumulator.push({
        userId,
        userObjectId: entry.userId,
        confirmedAt: entry.confirmedAt ? new Date(entry.confirmedAt) : new Date(0),
      });
      return accumulator;
    }, []);

  const confirmedUserIds = confirmedEntries.map((entry) => entry.userId);
  const confirmedUserIdSet = new Set(confirmedUserIds);

  const globalScores = new Map<string, number>();
  const manualLastRoleKeyByUserId = new Map<string, string>();
  if (confirmedUserIds.length > 0) {
    const profiles = await getUserModel().find({ _id: { $in: confirmedUserIds } }).select("_id globalScore lastRoleKey").lean();
    for (const profile of profiles) {
      const profileId = profile._id.toString();
      globalScores.set(profileId, normalizeGlobalScore(profile.globalScore));
      if (typeof profile.lastRoleKey === "string" && profile.lastRoleKey.trim()) {
        manualLastRoleKeyByUserId.set(profileId, profile.lastRoleKey);
      }
    }
  }

  const previousFunctionWeightByUserId = new Map<string, number>();
  if (confirmedUserIds.length > 0) {
    const previousMasses = await getMassModel()
      .find({
        _id: { $ne: mass._id },
        status: { $in: buildStatusSet(["FINISHED"]) },
        scheduledAt: { $lt: mass.scheduledAt },
        "attendance.confirmed.userId": { $in: confirmedEntries.map((entry) => entry.userObjectId) },
      })
      .sort({ scheduledAt: -1, _id: -1 })
      .select("attendance.confirmed assignments")
      .lean();
    const previousRoleKeys = Array.from(
      new Set(
        previousMasses.flatMap((previousMassRaw) =>
          (previousMassRaw.assignments ?? []).map((assignment) => assignment.roleKey)
        )
      )
    );
    const roleWeightMap = await getRoleWeightMap([...sortedRoleKeys, ...previousRoleKeys]);

    for (const previousMassRaw of previousMasses) {
      const previousMass = previousMassRaw as Pick<MassDocument, "attendance" | "assignments">;
      for (const confirmedEntry of previousMass.attendance?.confirmed ?? []) {
        const confirmedUserId = confirmedEntry.userId.toString();
        if (!confirmedUserIdSet.has(confirmedUserId) || previousFunctionWeightByUserId.has(confirmedUserId)) {
          continue;
        }

        const previousFunctionWeight = (previousMass.assignments ?? [])
          .filter((assignment) => assignment.userId?.toString() === confirmedUserId)
          .reduce((maxWeight, assignment) => {
            const roleWeight = roleWeightMap.get(assignment.roleKey) ?? 0;
            return roleWeight > maxWeight ? roleWeight : maxWeight;
          }, 0);

        previousFunctionWeightByUserId.set(confirmedUserId, previousFunctionWeight);
      }

      if (previousFunctionWeightByUserId.size === confirmedUserIdSet.size) {
        break;
      }
    }
  }

  const fallbackLastRoleKeys = Array.from(new Set(Array.from(manualLastRoleKeyByUserId.values())));
  if (fallbackLastRoleKeys.length > 0) {
    const fallbackRoleWeightMap = await getRoleWeightMap([...sortedRoleKeys, ...fallbackLastRoleKeys]);
    for (const confirmedUserId of confirmedUserIds) {
      if (previousFunctionWeightByUserId.has(confirmedUserId)) {
        continue;
      }
      const fallbackRoleKey = manualLastRoleKeyByUserId.get(confirmedUserId);
      if (!fallbackRoleKey) {
        continue;
      }
      previousFunctionWeightByUserId.set(confirmedUserId, fallbackRoleWeightMap.get(fallbackRoleKey) ?? 0);
    }
  }

  const totalConfirmed = confirmedEntries.length;
  const rankedAcolitos = confirmedEntries
    .map((entry, arrivalIndex) => {
      const arrivalScore =
        totalConfirmed <= 1
          ? 100
          : Math.round((100 * (totalConfirmed - 1 - arrivalIndex)) / Math.max(1, totalConfirmed - 1));
      const previousFunctionWeight = previousFunctionWeightByUserId.get(entry.userId) ?? 0;
      const rotationBonus = Math.round((100 - previousFunctionWeight) * 0.6);
      const globalScore = globalScores.get(entry.userId) ?? DEFAULT_GLOBAL_SCORE;
      const profileBonus = Math.round((globalScore - 50) * 0.4);
      const priorityScore = arrivalScore + rotationBonus + profileBonus;

      return {
        userId: entry.userId,
        userObjectId: entry.userObjectId,
        arrivalIndex,
        arrivalScore,
        previousFunctionWeight,
        rotationBonus,
        globalScore,
        profileBonus,
        priorityScore,
      };
    })
    .sort((acolitoA, acolitoB) => {
      if (acolitoA.priorityScore !== acolitoB.priorityScore) {
        return acolitoB.priorityScore - acolitoA.priorityScore;
      }

      if (acolitoA.arrivalIndex !== acolitoB.arrivalIndex) {
        return acolitoA.arrivalIndex - acolitoB.arrivalIndex;
      }

      if (acolitoA.globalScore !== acolitoB.globalScore) {
        return acolitoB.globalScore - acolitoA.globalScore;
      }

      return acolitoA.userId.localeCompare(acolitoB.userId);
    });

  const assignments: AssignmentEntry[] = sortedRoleKeys.map((roleKey, index) => ({
    roleKey,
    userId: rankedAcolitos[index]?.userObjectId ?? null,
  }));

  const callbackRoleKey = massTypeConfig.fallbackRoleKey ?? "NONE";
  for (let index = sortedRoleKeys.length; index < rankedAcolitos.length; index += 1) {
    assignments.push({ roleKey: callbackRoleKey, userId: rankedAcolitos[index].userObjectId });
  }

  return assignments;
}

export async function joinMassAction({ massId, actor }: AcolitoActionInput): Promise<MassDocument> {
  assertAcolitoRole(actor);

  const actorObjectId = toObjectId(actor.userId);
  const massObjectId = toObjectId(massId);

  const updated = await getMassModel()
    .findOneAndUpdate(
      {
        _id: massObjectId,
        status: { $in: buildStatusSet(["OPEN"]) },
        "attendance.joined.userId": { $ne: actorObjectId },
      },
      {
        $push: {
          "attendance.joined": {
            userId: actorObjectId,
            joinedAt: new Date(),
          },
          events: {
            type: "MASS_JOINED",
            actorId: actorObjectId,
            at: new Date(),
          },
        },
      },
      { new: true }
    )
    .lean();

  if (updated) {
    return asMassDocument(updated);
  }

  const mass = await getMassById(massId);
  if (!mass) {
    throw new NotFoundError("Missa nÃ£o encontrada");
  }

  checkAllowedStatus(mass, ["OPEN"]);

  return mass;
}

export async function requestMassConfirmationAction({ massId, actor }: AcolitoActionInput): Promise<{
  mass: MassDocument;
  requestId: string;
}> {
  assertAcolitoRole(actor);

  const actorObjectId = toObjectId(actor.userId);
  const massObjectId = toObjectId(massId);
  const requestId = randomUUID();

  const updated = await getMassModel()
    .findOneAndUpdate(
      {
        _id: massObjectId,
        status: { $in: buildStatusSet(["OPEN"]) },
        "attendance.joined.userId": actorObjectId,
        "attendance.confirmed.userId": { $ne: actorObjectId },
        "attendance.pending.userId": { $ne: actorObjectId },
      },
      [
        {
          $set: {
            "attendance.pending": {
              $concatArrays: [
                { $ifNull: ["$attendance.pending", []] },
                [{ requestId, userId: actorObjectId, requestedAt: "$$NOW" }],
              ],
            },
            ...appendEventPipelineStage("MASS_CONFIRMATION_REQUESTED", actorObjectId, { requestId }),
          },
        },
      ],
      { new: true }
    )
    .lean();

  if (updated) {
    return { mass: asMassDocument(updated), requestId };
  }

  const mass = await getMassById(massId);
  if (!mass) {
    throw new NotFoundError("Missa não encontrada");
  }

  checkAllowedStatus(mass, ["OPEN"]);

  const joinedEntries = mass.attendance?.joined ?? [];
  const pendingEntries = mass.attendance?.pending ?? [];

  const hasJoined = joinedEntries.some((entry) => entry.userId.toString() === actor.userId);
  if (!hasJoined) {
    throw new ConflictError("Participe da missa antes de solicitar confirmação de presença");
  }

  const pendingEntry = pendingEntries.find((entry) => entry.userId.toString() === actor.userId);
  if (pendingEntry) {
    return { mass, requestId: pendingEntry.requestId };
  }

  throw new ConflictError("Solicitação de confirmação não encontrada");
}

export async function previewMassConfirmationAction({
  massId,
  actor,
  requestId,
}: AdminActionInput & { requestId: string }): Promise<{ mass: MassDocument; pendingUserId: string }> {
  assertCerimoniarioRole(actor);

  const mass = await getMassById(massId);
  if (!mass) {
    throw new NotFoundError("Missa não encontrada");
  }

  assertCanAdminister(mass, actor.userId);
  checkAllowedStatus(mass, ["OPEN"]);

  const pendingEntries = mass.attendance?.pending ?? [];
  const confirmedEntries = mass.attendance?.confirmed ?? [];

  const pendingEntry = pendingEntries.find((entry) => entry.requestId === requestId);
  if (!pendingEntry) {
    throw new ConflictError("Solicitação de confirmação não encontrada");
  }

  if (confirmedEntries.some((entry) => entry.userId.toString() === pendingEntry.userId.toString())) {
    throw new ConflictError("A presença deste acólito já foi confirmada");
  }

  return { mass, pendingUserId: pendingEntry.userId.toString() };
}

export async function confirmMassAction({
  massId,
  actor,
  requestId,
  decision,
}: ReviewConfirmationInput): Promise<MassDocument> {
  assertCerimoniarioRole(actor);

  const actorObjectId = toObjectId(actor.userId);
  const massObjectId = toObjectId(massId);

  const updated = await getMassModel()
    .findOneAndUpdate(
      {
        _id: massObjectId,
        status: { $in: buildStatusSet(["OPEN"]) },
        "attendance.pending.requestId": requestId,
        $or: [{ createdBy: actorObjectId }, { chiefBy: actorObjectId }],
      },
      [
        {
          $set: {
            __pendingEntry: {
              $first: {
                $filter: {
                  input: { $ifNull: ["$attendance.pending", []] },
                  as: "pendingEntry",
                  cond: { $eq: ["$$pendingEntry.requestId", requestId] },
                },
              },
            },
          },
        },
        {
          $set: {
            "attendance.pending": {
              $filter: {
                input: { $ifNull: ["$attendance.pending", []] },
                as: "pendingEntry",
                cond: { $ne: ["$$pendingEntry.requestId", requestId] },
              },
            },
            "attendance.confirmed": {
              $cond: {
                if: {
                  $and: [{ $eq: [decision, "confirm"] }, { $ifNull: ["$__pendingEntry.userId", false] }],
                },
                then: {
                  $concatArrays: [
                    { $ifNull: ["$attendance.confirmed", []] },
                    [{ userId: "$__pendingEntry.userId", confirmedAt: "$$NOW" }],
                  ],
                },
                else: { $ifNull: ["$attendance.confirmed", []] },
              },
            },
            events: {
              $concatArrays: [
                "$events",
                [
                  {
                    type: {
                      $cond: {
                        if: { $eq: [decision, "confirm"] },
                        then: "MASS_CONFIRMED",
                        else: "MASS_CONFIRMATION_DENIED",
                      },
                    },
                    actorId: actorObjectId,
                    at: "$$NOW",
                    payload: {
                      requestId,
                      confirmedUserId: "$__pendingEntry.userId",
                    },
                  },
                ],
              ],
            },
          },
        },
        {
          $unset: "__pendingEntry",
        },
      ],
      { new: true }
    )
    .lean();

  if (updated) {
    return asMassDocument(updated);
  }

  const mass = await getMassById(massId);
  if (!mass) {
    throw new NotFoundError("Missa não encontrada");
  }

  assertCanAdminister(mass, actor.userId);
  checkAllowedStatus(mass, ["OPEN"]);

  throw new ConflictError("Solicitação de confirmação não encontrada");
}

