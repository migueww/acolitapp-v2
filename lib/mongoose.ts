import mongoose, { type Mongoose } from "mongoose";

export type MongooseModule = typeof mongoose;
export type MongooseConnection = Mongoose;

export const getMongoose = (): MongooseModule => mongoose;
