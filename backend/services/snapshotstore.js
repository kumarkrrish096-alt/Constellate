import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import zlib from "zlib";
import Snapshot from "../models/snapshot.js";
import { SNAPSHOT_DIR } from "../config/paths.js";

const gzip = promisify(zlib.gzip);

// "owner/repo" + sha + version -> "owner__repo@<sha>.v1.json.gz"
export function snapshotfilename(fullname, sha, version) {
  return `${fullname.replace("/", "__")}@${sha}.v${version}.json.gz`;
}

/**
 * Compress and write a snapshot so readers never see half a file: write to a
 * unique temp file in the same folder, then rename it over the final name
 * (a rename within one folder is atomic). Returns the final path and size.
 */
export async function writesnapshotfile(fullname, sha, version, data) {
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });

  const finalpath = path.join(SNAPSHOT_DIR, snapshotfilename(fullname, sha, version));
  const temppath = `${finalpath}.tmp-${process.pid}-${Date.now()}`;
  const body = await gzip(JSON.stringify(data));

  try {
    await fs.writeFile(temppath, body);
    await fs.rename(temppath, finalpath);
  } catch (error) {
    await fs.rm(temppath, { force: true });
    throw error;
  }

  return { filepath: finalpath, sizebytes: body.length };
}

/**
 * Record the snapshot in MongoDB, after the file is in place. Upsert, because
 * the same commit always produces the same snapshot: a retried or duplicated
 * job just overwrites the record with identical data.
 */
export async function savesnapshotrecord({ fullname, sha, version, filepath, sizebytes }) {
  await Snapshot.updateOne(
    { fullname, sha },
    {
      $set: { filepath, version, sizebytes, createdat: new Date() },
    },
    { upsert: true }
  );
}
