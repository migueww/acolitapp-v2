import mongoose, { Schema, type Model, type InferSchemaType } from "mongoose";

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

export type MassDocument = InferSchemaType<typeof massSchema> & {
  _id: mongoose.Types.ObjectId;
};

const Mass: Model<MassDocument> =
  mongoose.models.Mass || mongoose.model<MassDocument>("Mass", massSchema);

export default Mass;
