import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const SNAPSHOT_DIR = path.join(here, "..", "snapshots");