import type { MongooseConnection } from "@/lib/mongoose";

declare global {
  // eslint-disable-next-line no-var
  var mongoose:
    | {
        conn: MongooseConnection | null;
        promise: Promise<MongooseConnection> | null;
      }
    | undefined;
}

export {};
