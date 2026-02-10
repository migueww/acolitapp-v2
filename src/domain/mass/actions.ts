import { getMongoose } from "@/lib/mongoose";
import { getMassModel, type AssignmentEntry, type MassDocument } from "@/models/Mass";

import { ConflictError, NotFoundError } from "@/src/domain/mass/errors";
import { assertAcolitoRole, assertCerimoniarioRole } from "@/src/domain/mass/guards";
import { DEFAULT_ROLE_KEYS, type ActionType, type Actor, type EventPayload, type MassStatus } from "@/src/domain/mass/types";

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

const toObjectId = (id: string) => {
  const mongoose = getMongoose();
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new NotFoundError("Missa não encontrada");
  }

  return new mongoose.Types.ObjectId(id);
};

const getMassById = async (massId: string): Promise<MassDocument | null> => {
  const mass = await getMassModel().findById(toObjectId(massId)).lean();
  return mass as MassDocument | null;
};

const checkAllowedStatus = (mass: MassDocument, allowedStatuses: MassStatus[]): void => {
  if (!allowedStatuses.includes(mass.status)) {
    throw new ConflictError(`Ação não permitida no status ${mass.status}`);
  }
};

const assertCanAdminister = (mass: MassDocument, actorId: string): void => {
  if (![mass.createdBy.toString(), mass.chiefBy.toString()].includes(actorId)) {
    throw new NotFoundError("Missa não encontrada");
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
    throw new NotFoundError("Missa não encontrada");
  }

  assertCanAdminister(mass, actor.userId);
  checkAllowedStatus(mass, ["SCHEDULED"]);
  throw new ConflictError("A missa não pôde ser aberta por concorrência");
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
            status: "PREPARATION",
            preparationAt: "$$NOW",
            "attendance.joined": "$__newJoined",
            ...appendEventPipelineStage("MASS_MOVED_TO_PREPARATION", actorObjectId, {
              removedJoinedCount: { $subtract: [{ $size: "$attendance.joined" }, { $size: "$__newJoined" }] },
            }),
          },
        },
        {
          $unset: ["__confirmedIds", "__newJoined", "__removedCount"],
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
  throw new ConflictError("A missa não pôde ser movida para preparação por concorrência");
}

export async function finishMassAction({ massId, actor }: AdminActionInput): Promise<MassDocument> {
  assertCerimoniarioRole(actor);

  const actorObjectId = toObjectId(actor.userId);
  const massObjectId = toObjectId(massId);
  const defaultAssignments = DEFAULT_ROLE_KEYS.map((roleKey) => ({ roleKey, userId: null }));

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
                else: defaultAssignments,
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
    throw new NotFoundError("Missa não encontrada");
  }

  assertCanAdminister(mass, actor.userId);
  checkAllowedStatus(mass, ["SCHEDULED", "OPEN"]);
  throw new ConflictError("A missa não pôde ser cancelada por concorrência");
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
    throw new NotFoundError("Missa não encontrada");
  }

  if (mass.createdBy.toString() !== actor.userId) {
    throw new NotFoundError("Missa não encontrada");
  }

  checkAllowedStatus(mass, ["SCHEDULED", "OPEN", "PREPARATION"]);
  throw new ConflictError("A missa não pôde ser delegada por concorrência");
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
    throw new NotFoundError("Missa não encontrada");
  }

  assertCanAdminister(mass, actor.userId);
  checkAllowedStatus(mass, ["PREPARATION"]);
  throw new ConflictError("As funções não puderam ser atribuídas por concorrência");
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
    throw new NotFoundError("Missa não encontrada");
  }

  checkAllowedStatus(mass, ["OPEN"]);

  return mass;
}

export async function confirmMassAction({ massId, actor }: AcolitoActionInput): Promise<MassDocument> {
  assertAcolitoRole(actor);

  const actorObjectId = toObjectId(actor.userId);
  const massObjectId = toObjectId(massId);

  const updated = await getMassModel()
    .findOneAndUpdate(
      {
        _id: massObjectId,
        status: "OPEN",
        "attendance.confirmed.userId": { $ne: actorObjectId },
      },
      [
        {
          $set: {
            "attendance.confirmed": {
              $concatArrays: [
                "$attendance.confirmed",
                [{ userId: actorObjectId, confirmedAt: "$$NOW" }],
              ],
            },
            "attendance.joined": {
              $cond: {
                if: {
                  $in: [
                    actorObjectId,
                    {
                      $map: {
                        input: "$attendance.joined",
                        as: "joinedEntry",
                        in: "$$joinedEntry.userId",
                      },
                    },
                  ],
                },
                then: "$attendance.joined",
                else: {
                  $concatArrays: [
                    "$attendance.joined",
                    [{ userId: actorObjectId, joinedAt: "$$NOW" }],
                  ],
                },
              },
            },
            ...appendEventPipelineStage("MASS_CONFIRMED", actorObjectId),
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

  checkAllowedStatus(mass, ["OPEN"]);

  return mass;
}
