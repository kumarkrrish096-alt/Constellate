import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";
import yauzl from "yauzl";
import { LIMITS, IGNORED_FOLDERS, CODE_EXTENSIONS } from "../config/limits.js";

function openzip(zippath) {
  return new Promise((resolve, reject) => {
    yauzl.open(zippath, { lazyEntries: true }, (error, zipfile) => {
      if (error) reject(error);
      else resolve(zipfile);
    });
  });
}

function openstream(zipfile, entry) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error) reject(error);
      else resolve(stream);
    });
  });
}

export async function unzipsafely(zippath, destfolder) {
  const zipfile = await openzip(zippath);
  const root = path.resolve(destfolder);
  const files = [];
  let entrycount = 0;
  let totalbytes = 0;

  return new Promise((resolve, reject) => {
    const fail = (error) => {
      zipfile.close();
      reject(error);
    };

    zipfile.on("error", fail);
    zipfile.on("end", () => resolve(files));

    zipfile.on("entry", async (entry) => {
      try {
        entrycount++;
        if (entrycount > LIMITS.maxEntries) {
          throw new Error("Repository has too many entries");
        }

        // Folder entries end with "/", nothing to extract
        if (entry.fileName.endsWith("/")) {
          zipfile.readEntry();
          return;
        }

        // GitHub wraps everything in one top folder, so remove it
        const parts = entry.fileName.split("/");
        parts.shift();
        const relative = parts.join("/");

        const infolder = parts.slice(0, -1);
        const isignored = infolder.some((name) => IGNORED_FOLDERS.includes(name));
        const iscode = CODE_EXTENSIONS.includes(path.extname(relative).toLowerCase());
        const toobig = entry.uncompressedSize > LIMITS.maxFileBytes;

        if (!relative || isignored || !iscode || toobig) {
          zipfile.readEntry();
          return;
        }

        // Zip-slip check: the final path must stay inside our folder
        const target = path.resolve(root, relative);
        if (!target.startsWith(root + path.sep)) {
          throw new Error("Unsafe file path in archive");
        }

        if (files.length + 1 > LIMITS.maxFiles) {
          throw new Error("Repository has too many source files");
        }

        totalbytes += entry.uncompressedSize;
        if (totalbytes > LIMITS.maxTotalBytes) {
          throw new Error("Repository source is too large");
        }

        await fsp.mkdir(path.dirname(target), { recursive: true });
        const stream = await openstream(zipfile, entry);
        await pipeline(stream, fs.createWriteStream(target));

        files.push(relative);
        zipfile.readEntry();
      } catch (error) {
        fail(error);
      }
    });

    zipfile.readEntry();
  });
}