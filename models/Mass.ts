import type { HydratedDocument, Model, Types } from "mongoose";

import { getMongoose } from "@/lib/mongoose";

export const MASS_STATUSES = ["SCHEDULED", "OPEN", "PREPARATION", "FINISHED", "CANCELED"] as const;
export type MassStatus = (typeof MASS_STATUSES)[number];
export const MASS_TYPES = ["SIMPLES", "SOLENE", "PALAVRA"] as const;
export type MassType = (typeof MASS_TYPES)[number];

export type AttendanceEntry = {
  userId: Types.ObjectId;
  joinedAt?: Date;
  confirmedAt?: Date;
};

export type PendingConfirmationEntry = {
  requestId: string;
  userId: Types.ObjectId;
  requestedAt: Date;
};

export type AssignmentEntry = {
  roleKey: string;
  userId: Types.ObjectId | null;
};

export type EventEntry = {
  type: string;
  actorId: Types.ObjectId;
  at: Date;
  payload?: unknown;
};

export type MassDocument = {
  _id: Types.ObjectId;
  status: MassStatus;
  massType: MassType;
  scheduledAt: Date;
  createdBy: Types.ObjectId;
  chiefBy: Types.ObjectId;
  openedAt?: Date;
  preparationAt?: Date;
  finishedAt?: Date;
  canceledAt?: Date;
  attendance: {
    joined: Array<AttendanceEntry>;
    confirmed: Array<AttendanceEntry>;
    pending: Array<PendingConfirmationEntry>;
  };
  assignments: Array<AssignmentEntry>;
  events: Array<EventEntry>;
  createdAt: Date;
  updatedAt: Date;
};

type MassSchemaType = Omit<MassDocument, "_id">;

const buildMassSchema = (mongoose: ReturnType<typeof getMongoose>) => {
  const attendanceJoinedSchema = new mongoose.Schema(
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      joinedAt: { type: Date, default: Date.now, required: true },
    },
    { _id: false }
  );

  const attendanceConfirmedSchema = new mongoose.Schema(
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      confirmedAt: { type: Date, default: Date.now, required: true },
    },
    { _id: false }
  );

  const attendancePendingSchema = new mongoose.Schema(
    {
      requestId: { type: String, required: true, trim: true },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      requestedAt: { type: Date, default: Date.now, required: true },
    },
    { _id: false }
  );

  const assignmentSchema = new mongoose.Schema(
    {
      roleKey: { type: String, required: true, trim: true },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { _id: false }
  );

  const eventSchema = new mongoose.Schema(
    {
      type: { type: String, required: true, trim: true },
      actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      at: { type: Date, default: Date.now, required: true },
      payload: { type: mongoose.Schema.Types.Mixed },
    },
    { _id: false }
  );

  const schema = new mongoose.Schema<MassSchemaType>(
    {
      status: {
        type: String,
        enum: MASS_STATUSES,
        default: "SCHEDULED",
        required: true,
      },
      massType: {
        type: String,
        enum: MASS_TYPES,
        required: true,
      },
      scheduledAt: { type: Date, required: true },
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      chiefBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      openedAt: { type: Date },
      preparationAt: { type: Date },
      finishedAt: { type: Date },
      canceledAt: { type: Date },
      attendance: {
        joined: { type: [attendanceJoinedSchema], default: [] },
        confirmed: { type: [attendanceConfirmedSchema], default: [] },
        pending: { type: [attendancePendingSchema], default: [] },
      },
      assignments: { type: [assignmentSchema], default: [] },
      events: { type: [eventSchema], default: [] },
    },
    { timestamps: true }
  );

  schema.index({ status: 1, scheduledAt: 1 });
  schema.index({ scheduledAt: 1 });
  schema.index({ createdBy: 1 });
  schema.index({ chiefBy: 1 });

  return schema;
};

export type MassModel = Model<MassSchemaType>;
export type MassHydratedDocument = HydratedDocument<MassSchemaType>;

export const getMassModel = (): MassModel => {
  const mongoose = getMongoose();
  return (mongoose.models.Mass as MassModel | undefined) ||
    mongoose.model<MassSchemaType>("Mass", buildMassSchema(mongoose));
};
