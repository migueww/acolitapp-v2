import { getMongoose } from "@/lib/mongoose";
import type { MassDocument } from "@/models/Mass";

import { ConflictError, ForbiddenError } from "@/src/domain/mass/errors";
import type { Actor, MassStatus } from "@/src/domain/mass/types";

export const isCerimoniario = (actor: Actor): boolean => actor.role === "CERIMONIARIO";

export const canAdministerMass = (actor: Actor, mass: Pick<MassDocument, "createdBy" | "chiefBy">): boolean => {
  const mongoose = getMongoose();

  const actorId = new mongoose.Types.ObjectId(actor.userId);
  return mass.createdBy.equals(actorId) || mass.chiefBy.equals(actorId);
};

export const assertStatus = (mass: Pick<MassDocument, "status">, allowedStatuses: MassStatus[]): void => {
  if (!allowedStatuses.includes(mass.status)) {
    throw new ConflictError(`Transição inválida para status ${mass.status}`);
  }
};

export const assertCerimoniarioRole = (actor: Actor): void => {
  if (!isCerimoniario(actor)) {
    throw new ForbiddenError("Apenas CERIMONIARIO pode executar esta ação");
  }
};

export const assertAcolitoRole = (actor: Actor): void => {
  if (actor.role !== "ACOLITO") {
    throw new ForbiddenError("Apenas ACOLITO pode executar esta ação");
  }
};
