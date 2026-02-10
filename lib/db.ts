import mongoose, { type Mongoose } from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("Defina a variável de ambiente MONGODB_URI no arquivo .env.local");
}

const MONGODB_URI_SAFE = MONGODB_URI;

type MongooseCache = {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
};

const cached: MongooseCache = global.mongooseGlobal ?? { conn: null, promise: null };

global.mongooseGlobal = cached;

export default async function dbConnect(): Promise<Mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI_SAFE);
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
