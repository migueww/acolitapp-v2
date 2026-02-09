export type MongooseModule = {
  connect: (uri: string) => Promise<MongooseModule>;
  models: Record<string, unknown>;
  model: <T = unknown>(name: string, schema: unknown) => T;
  Schema: new (...args: unknown[]) => unknown;
  Types: { ObjectId: unknown };
};

let cachedMongoose: MongooseModule | null = null;

export const getMongoose = (): MongooseModule => {
  if (!cachedMongoose) {
    const requireFn = eval("require") as (id: string) => unknown;
    cachedMongoose = requireFn("mongoose") as MongooseModule;
  }

  return cachedMongoose;
};
