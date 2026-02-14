import { randomUUID } from "node:crypto";

import { getMongoose } from "@/lib/mongoose";
import { getMassModel, type AssignmentEntry, type MassDocument } from "@/models/Mass";
import { getAssignmentsTemplateByMassType } from "@/src/domain/mass/role-templates";

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

const checkAllowedStatus = (mass: MassDocument, allowedStatuses: MassStatus[]): void => {
  if (!allowedStatuses.includes(mass.status)) {
    throw new ConflictError(`AÃ§Ã£o nÃ£o permitida no status ${mass.status}`);
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

export async function openMassAction({ massId, actor }: AdminActionInput): Promise<MassDocument> {
  assertCerimoniarioRole(actor);

  const actorObjectId = toObjectId(actor.userId);
  const massObjectId = toObjectId(massId);

  const updated = await getMassModel()
    .findOneAndUpdate(
      {
        _id: massObjectId,
        status: "SCHEDULED",
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
        status: "OPEN",
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

  const updated = await getMassModel()
    .findOneAndUpdate(
      {
        _id: massObjectId,
        status: "PREPARATION",
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
                else: {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$massType", "SIMPLES"] }, then: getAssignmentsTemplateByMassType("SIMPLES") },
                      { case: { $eq: ["$massType", "SOLENE"] }, then: getAssignmentsTemplateByMassType("SOLENE") },
                    ],
                    default: getAssignmentsTemplateByMassType("PALAVRA"),
                  },
                },
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
    throw new NotFoundError("Missa nÃ£o encontrada");
  }

  assertCanAdminister(mass, actor.userId);
  checkAllowedStatus(mass, ["PREPARATION"]);
  throw new ConflictError("A missa nÃ£o pÃ´de ser finalizada por concorrÃªncia");
}

export async function cancelMassAction({ massId, actor }: AdminActionInput): Promise<MassDocument> {
  assertCerimoniarioRole(actor);

  const actorObjectId = toObjectId(actor.userId);
  const massObjectId = toObjectId(massId);

  const updated = await getMassModel()
    .findOneAndUpdate(
      {
        _id: massObjectId,
        status: { $in: ["SCHEDULED", "OPEN"] },
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
        status: { $nin: ["FINISHED", "CANCELED"] },
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
        status: "PREPARATION",
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

export async function joinMassAction({ massId, actor }: AcolitoActionInput): Promise<MassDocument> {
  assertAcolitoRole(actor);

  const actorObjectId = toObjectId(actor.userId);
  const massObjectId = toObjectId(massId);

  const updated = await getMassModel()
    .findOneAndUpdate(
      {
        _id: massObjectId,
        status: "OPEN",
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
        status: "OPEN",
        "attendance.joined.userId": actorObjectId,
        "attendance.confirmed.userId": { $ne: actorObjectId },
        "attendance.pending.userId": { $ne: actorObjectId },
      },
      [
        {
          $set: {
            "attendance.pending": {
              $concatArrays: [
                "$attendance.pending",
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

  const hasJoined = mass.attendance.joined.some((entry) => entry.userId.toString() === actor.userId);
  if (!hasJoined) {
    throw new ConflictError("Participe da missa antes de solicitar confirmação de presença");
  }

  const pendingEntry = mass.attendance.pending.find((entry) => entry.userId.toString() === actor.userId);
  if (pendingEntry) {
    return { mass, requestId: pendingEntry.requestId };
  }

  return { mass, requestId };
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

  const pendingEntry = mass.attendance.pending.find((entry) => entry.requestId === requestId);
  if (!pendingEntry) {
    throw new ConflictError("Solicitação de confirmação não encontrada");
  }

  if (mass.attendance.confirmed.some((entry) => entry.userId.toString() === pendingEntry.userId.toString())) {
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
        status: "OPEN",
        "attendance.pending.requestId": requestId,
        $or: [{ createdBy: actorObjectId }, { chiefBy: actorObjectId }],
      },
      [
        {
          $set: {
            __pendingEntry: {
              $first: {
                $filter: {
                  input: "$attendance.pending",
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
                input: "$attendance.pending",
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
                    "$attendance.confirmed",
                    [{ userId: "$__pendingEntry.userId", confirmedAt: "$$NOW" }],
                  ],
                },
                else: "$attendance.confirmed",
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

