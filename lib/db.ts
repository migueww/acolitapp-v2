import { getMongoose, type MongooseModule } from "@/lib/mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Defina a variável de ambiente MONGODB_URI no arquivo .env.local");
}

const MONGODB_URI_SAFE = MONGODB_URI;

type MongooseCache = {
  conn: MongooseModule | null;
  promise: Promise<MongooseModule> | null;
};

const cached: MongooseCache = global.mongoose ?? { conn: null, promise: null };

global.mongoose = cached;

export default async function dbConnect(): Promise<MongooseModule> {
  const mongoose = getMongoose();
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(MONGODB_URI_SAFE)
      .then((mongooseInstance) => mongooseInstance)
      .catch((error) => {
        cached.promise = null;
        throw error;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
