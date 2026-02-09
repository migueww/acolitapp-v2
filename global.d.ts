import type { MongooseModule } from "@/lib/mongoose";

declare global {
  // eslint-disable-next-line no-var
  var mongoose:
    | {
        conn: MongooseModule | null;
        promise: Promise<MongooseModule> | null;
      }
    | undefined;
}

export {};
