import { getMongoose } from "@/lib/mongoose";

export type MassDocument = {
  _id: string;
  status: "SCHEDULED" | "OPEN" | "PREPARATION" | "FINISHED" | "CANCELED";
  scheduledAt: Date;
  createdBy?: string;
  chiefBy?: string;
  openedAt?: Date;
  preparationAt?: Date;
  finishedAt?: Date;
  canceledAt?: Date;
};

const buildMassSchema = (mongoose: ReturnType<typeof getMongoose>) =>
  new mongoose.Schema(
    {
      status: {
        type: String,
        enum: ["SCHEDULED", "OPEN", "PREPARATION", "FINISHED", "CANCELED"],
        default: "SCHEDULED",
        required: true,
      },
      scheduledAt: { type: Date, required: true },
      createdBy: { type: mongoose.Types.ObjectId, ref: "User" },
      chiefBy: { type: mongoose.Types.ObjectId, ref: "User" },
      openedAt: { type: Date },
      preparationAt: { type: Date },
      finishedAt: { type: Date },
      canceledAt: { type: Date },
    },
    { timestamps: true }
  );

export const getMassModel = (): Record<string, unknown> => {
  const mongoose = getMongoose();
  const existing = mongoose.models.Mass as Record<string, unknown> | undefined;

  if (existing) {
    return existing;
  }

  const schema = buildMassSchema(mongoose);
  return mongoose.model<MassDocument>("Mass", schema) as Record<string, unknown>;
};
