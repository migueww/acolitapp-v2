import type { HydratedDocument, Model } from "mongoose";

import { getMongoose } from "@/lib/mongoose";

export type LiturgyRoleDocument = {
  key: string;
  label: string;
  description: string;
  score: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type LiturgyRoleSchemaType = LiturgyRoleDocument;

const buildLiturgyRoleSchema = (mongoose: ReturnType<typeof getMongoose>) =>
  new mongoose.Schema<LiturgyRoleSchemaType>(
    {
      key: { type: String, required: true, unique: true, uppercase: true, trim: true },
      label: { type: String, required: true, trim: true },
      description: { type: String, default: "", trim: true },
      score: { type: Number, default: 0, min: 0, max: 1000, required: true },
      active: { type: Boolean, default: true, required: true },
    },
    { timestamps: true }
  );

export type LiturgyRoleModel = Model<LiturgyRoleSchemaType>;
export type LiturgyRoleHydratedDocument = HydratedDocument<LiturgyRoleSchemaType>;

export const getLiturgyRoleModel = (): LiturgyRoleModel => {
  const mongoose = getMongoose();
  return (mongoose.models.LiturgyRole as LiturgyRoleModel | undefined) ||
    mongoose.model<LiturgyRoleSchemaType>("LiturgyRole", buildLiturgyRoleSchema(mongoose));
};
