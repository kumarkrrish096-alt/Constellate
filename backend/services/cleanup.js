import fs from "fs/promises";
import os from "os";
import path from "path";

export async function cleanupfolder(folder) {
  if (!folder) {
    return;
  }

  const target = path.resolve(folder);
  const tempbase = path.resolve(os.tmpdir());
  const name = path.basename(target);

  // Safety: only delete our own temp folders
  const insidetemp = target.startsWith(tempbase + path.sep);
  const isours = name.startsWith("constellate-");

  if (!insidetemp || !isours) {
    console.error("Refusing to delete unexpected folder:", target);
    return;
  }

  try {
    await fs.rm(target, { recursive: true, force: true });
  } catch (error) {
    console.error("Cleanup failed:", error.message);
  }
}