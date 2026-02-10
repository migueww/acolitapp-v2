import { getMongoose } from "@/lib/mongoose";
import type { UserRole } from "@/lib/auth";

import type { HydratedDocument, Model, Types } from "mongoose";

export type UserDocument = {
  _id: Types.ObjectId;
  name: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
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
      active: { type: Boolean, default: true, required: true },
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
