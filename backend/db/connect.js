import { MongoClient } from "mongodb";

let client;
let database;

export async function connectdb() {
  if (database) {
    return database;
  }

  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  database = client.db(process.env.DB_NAME);

  console.log("Connected to MongoDB");
  return database;
}

export function getdb() {
  if (!database) {
    throw new Error("Database not connected yet");
  }
  return database;
}