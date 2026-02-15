import { getMongoose } from "@/lib/mongoose";
import type { UserRole } from "@/lib/auth";

import type { HydratedDocument, Model, Types } from "mongoose";

export type UserDocument = {
  _id: Types.ObjectId;
  name: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  lastRoleKey?: string | null;
  active: boolean;
  globalScore: number;
  createdAt: Date;
  updatedAt: Date;
};

type UserSchemaType = Omit<UserDocument, "_id">;

const buildUserSchema = (mongoose: ReturnType<typeof getMongoose>) =>
  new mongoose.Schema<UserSchemaType>(
    {
      name: { type: String, required: true, trim: true },
      username: { type: String, required: true, unique: true, lowercase: true, trim: true },
      passwordHash: { type: String, required: true },
      role: {
        type: String,
        enum: ["CERIMONIARIO", "ACOLITO"],
        default: "ACOLITO",
        required: true,
      },
      lastRoleKey: { type: String, default: null, trim: true },
      active: { type: Boolean, default: true, required: true },
      globalScore: { type: Number, default: 50, min: 0, max: 100, required: true },
    },
    { timestamps: true }
  );

export type UserModel = Model<UserSchemaType>;
export type UserHydratedDocument = HydratedDocument<UserSchemaType>;

export const getUserModel = (): UserModel => {
  const mongoose = getMongoose();
  return (mongoose.models.User as UserModel | undefined) ||
    mongoose.model<UserSchemaType>("User", buildUserSchema(mongoose));
};
