import { getMongoose } from "@/lib/mongoose";

export type UserDocument = {
  _id: string;
  name: string;
  username: string;
  passwordHash: string;
  role: "CERIMONIARIO" | "ACOLITO";
  active: boolean;
};

type UserModel = {
  findOne: (filter: Record<string, unknown>) => { lean: () => Promise<UserDocument | null> };
  create: (payload: Omit<UserDocument, "_id">) => Promise<UserDocument>;
};

const buildUserSchema = (mongoose: ReturnType<typeof getMongoose>) =>
  new mongoose.Schema(
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
  const mongoose = getMongoose();
  const existing = mongoose.models.User as UserModel | undefined;

  if (existing) {
    return existing;
  }

  const schema = buildUserSchema(mongoose);
  return mongoose.model<UserDocument>("User", schema) as unknown as UserModel;
};
