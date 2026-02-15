import type { MassDocument } from "@/models/Mass";

export const serializeMass = (mass: MassDocument) => ({
  id: mass._id.toString(),
  name: mass.name ?? "",
  status: mass.status,
  massType: mass.massType,
  scheduledAt: mass.scheduledAt,
  createdBy: mass.createdBy.toString(),
  chiefBy: mass.chiefBy.toString(),
  openedAt: mass.openedAt ?? null,
  preparationAt: mass.preparationAt ?? null,
  finishedAt: mass.finishedAt ?? null,
  canceledAt: mass.canceledAt ?? null,
  attendance: {
    joined:
      mass.attendance?.joined?.map((entry) => ({
        userId: entry.userId.toString(),
        joinedAt: entry.joinedAt,
      })) ?? [],
    confirmed:
      mass.attendance?.confirmed?.map((entry) => ({
        userId: entry.userId.toString(),
        confirmedAt: entry.confirmedAt,
      })) ?? [],
    pending:
      mass.attendance?.pending?.map((entry) => ({
        requestId: entry.requestId,
        userId: entry.userId.toString(),
        requestedAt: entry.requestedAt,
      })) ?? [],
  },
  assignments:
    mass.assignments?.map((assignment) => ({
      roleKey: assignment.roleKey,
      userId: assignment.userId ? assignment.userId.toString() : null,
    })) ?? [],
  events:
    mass.events?.map((event) => ({
      type: event.type,
      actorId: event.actorId.toString(),
      at: event.at,
      payload: event.payload ?? null,
    })) ?? [],
  createdAt: mass.createdAt,
  updatedAt: mass.updatedAt,
});
