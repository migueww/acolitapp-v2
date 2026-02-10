import mongoose, { Schema } from "mongoose";

export type MassDocument = {
  _id: mongoose.Types.ObjectId;
  status: "SCHEDULED" | "OPEN" | "PREPARATION" | "FINISHED" | "CANCELED";
  scheduledAt: Date;
  createdBy?: mongoose.Types.ObjectId;
  chiefBy?: mongoose.Types.ObjectId;
  openedAt?: Date;
  preparationAt?: Date;
  finishedAt?: Date;
  canceledAt?: Date;
};

const massSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["SCHEDULED", "OPEN", "PREPARATION", "FINISHED", "CANCELED"],
      default: "SCHEDULED",
      required: true,
    },
    scheduledAt: { type: Date, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    chiefBy: { type: Schema.Types.ObjectId, ref: "User" },
    openedAt: { type: Date },
    preparationAt: { type: Date },
    finishedAt: { type: Date },
    canceledAt: { type: Date },
  },
  { timestamps: true }
);

type MassModel = unknown;

export const getMassModel = (): MassModel => {
  const existing = mongoose.models.Mass as unknown as MassModel | undefined;

  if (existing) {
    return existing;
  }

  return mongoose.model<MassDocument>("Mass", massSchema) as unknown as MassModel;
};
