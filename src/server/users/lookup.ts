import type { Types } from "mongoose";

import { getMongoose } from "@/lib/mongoose";
import { getUserModel } from "@/models/User";

type UserIdLike = string | Types.ObjectId | null | undefined;

const toIdString = (value: UserIdLike): string | null => {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : value.toString();
};

export async function getUserNameMapByIds(ids: UserIdLike[]): Promise<Map<string, string>> {
  const mongoose = getMongoose();
  const uniqueIds = Array.from(
    new Set(
      ids
        .map(toIdString)
        .filter((id): id is string => typeof id === "string")
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
    )
  );

  if (uniqueIds.length === 0) {
    return new Map<string, string>();
  }

  const users = await getUserModel().find({ _id: { $in: uniqueIds } }).select("_id name").lean();
  return new Map<string, string>(users.map((user) => [user._id.toString(), user.name]));
}
