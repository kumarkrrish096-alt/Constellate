import assert from "node:assert/strict";
import test from "node:test";
import fs from "fs/promises";
import path from "path";
import Snapshot from "../models/snapshot.js";
import { SNAPSHOT_DIR } from "../config/paths.js";
import { findsnapshot } from "./jobs.js";

test("only treats readable snapshots inside the snapshot directory as cache hits", async t => {
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
  const validPath = path.join(SNAPSHOT_DIR, `jobs-test-${process.pid}-${Date.now()}.json.gz`);
  await fs.writeFile(validPath, "test snapshot");

  const originalFindOne = Snapshot.findOne;
  let record = { fullname: "owner/repo", sha: "a".repeat(40), version: 1, filepath: validPath };
  Snapshot.findOne = () => ({ lean: async () => record });
  t.after(async () => {
    Snapshot.findOne = originalFindOne;
    await fs.rm(validPath, { force: true });
  });

  assert.equal(await findsnapshot("owner/repo", "a".repeat(40)), record);

  record = { ...record, filepath: path.join(SNAPSHOT_DIR, "missing-snapshot.json.gz") };
  assert.equal(await findsnapshot("owner/repo", "a".repeat(40)), null);

  record = { ...record, filepath: path.resolve(SNAPSHOT_DIR, "..", "outside.json.gz") };
  assert.equal(await findsnapshot("owner/repo", "a".repeat(40)), null);
});
