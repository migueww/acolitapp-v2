import mongoose, { Schema } from "mongoose";

export type UserRole = "CERIMONIARIO" | "ACOLITO";

export type UserDocument = {
  _id: mongoose.Types.ObjectId;
  name: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
};

type UserModel = {
  findOne: (filter: Record<string, unknown>) => { lean: () => Promise<UserDocument | null> };
  create: (payload: Omit<UserDocument, "_id">) => Promise<UserDocument>;
};

const userSchema = new Schema(
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

export const getUserModel = (): UserModel => {
  const existing = mongoose.models.User as UserModel | undefined;

  if (existing) {
    return existing;
  }

  return mongoose.model<UserDocument>("User", userSchema) as unknown as UserModel;
};
