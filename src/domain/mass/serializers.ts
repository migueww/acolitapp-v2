import type { MassDocument } from "@/models/Mass";

export const serializeMass = (mass: MassDocument) => ({
  id: mass._id.toString(),
  status: mass.status,
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
