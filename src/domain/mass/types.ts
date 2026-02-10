import type { Types } from "mongoose";

import type { AuthUser } from "@/lib/auth";
import type { MassDocument } from "@/models/Mass";

export type MassStatus = MassDocument["status"];

export const MASS_ACTION_TYPES = [
  "MASS_OPENED",
  "MASS_MOVED_TO_PREPARATION",
  "MASS_FINISHED",
  "MASS_CANCELED",
  "MASS_DELEGATED",
  "MASS_ASSIGNMENTS_UPDATED",
  "MASS_JOINED",
  "MASS_CONFIRMED",
] as const;

export type ActionType = (typeof MASS_ACTION_TYPES)[number];

export type Actor = AuthUser;

export type EventPayload = Record<string, unknown>;

export type EventInput = {
  type: ActionType;
  actorId: Types.ObjectId;
  at: Date;
  payload?: EventPayload;
};

