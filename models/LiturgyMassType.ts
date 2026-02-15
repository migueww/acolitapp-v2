import type { HydratedDocument, Model } from "mongoose";

import { getMongoose } from "@/lib/mongoose";

export type LiturgyMassTypeDocument = {
  key: string;
  label: string;
  roleKeys: string[];
  fallbackRoleKey: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type LiturgyMassTypeSchemaType = LiturgyMassTypeDocument;

const buildLiturgyMassTypeSchema = (mongoose: ReturnType<typeof getMongoose>) =>
  new mongoose.Schema<LiturgyMassTypeSchemaType>(
    {
      key: { type: String, required: true, unique: true, uppercase: true, trim: true },
      label: { type: String, required: true, trim: true },
      roleKeys: { type: [String], default: [], required: true },
      fallbackRoleKey: { type: String, default: null, trim: true },
      active: { type: Boolean, default: true, required: true },
    },
    { timestamps: true }
  );

export type LiturgyMassTypeModel = Model<LiturgyMassTypeSchemaType>;
export type LiturgyMassTypeHydratedDocument = HydratedDocument<LiturgyMassTypeSchemaType>;

export const getLiturgyMassTypeModel = (): LiturgyMassTypeModel => {
  const mongoose = getMongoose();
  return (mongoose.models.LiturgyMassType as LiturgyMassTypeModel | undefined) ||
    mongoose.model<LiturgyMassTypeSchemaType>("LiturgyMassType", buildLiturgyMassTypeSchema(mongoose));
};
