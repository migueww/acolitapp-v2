import type { Mongoose } from "mongoose";

declare global {
  // eslint-disable-next-line no-var
  var mongooseGlobal:
    | {
        conn: Mongoose | null;
        promise: Promise<Mongoose> | null;
      }
    | undefined;
}

export {};
