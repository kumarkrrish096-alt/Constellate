import { getdb } from "./connect.js";

export async function createindexes() {
  const db = getdb();

  // One record per repository
  await db.collection("repositories").createIndex(
    { fullname: 1 },
    { unique: true }
  );

  // One job per repository and commit
  await db.collection("jobs").createIndex(
    { fullname: 1, sha: 1 },
    { unique: true }
  );

  // Helps workers find the oldest waiting job quickly (used later)
  await db.collection("jobs").createIndex(
    { status: 1, createdat: 1 }
  );

  // One snapshot per repository and commit
  await db.collection("snapshots").createIndex(
    { fullname: 1, sha: 1 },
    { unique: true }
  );

  console.log("Database indexes ready");
}