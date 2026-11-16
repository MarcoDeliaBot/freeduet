/**
 * The helper's files, handed to the person who is at the computer (docs/design/programs-on-your-computer.md,
 * slice S5a): a plain zip of the four files the running server itself carries, so nobody has to find a folder inside
 * WSL or a source checkout.
 *
 * WHERE THE FILES ARE. `openbot/scripts/programs-helper/`, which from this file is `../../../scripts/programs-helper`:
 * a source checkout started by `scripts/start.sh` has it there, and both images (server/Dockerfile and the all-in-one
 * Dockerfile) copy that one folder to `/app/scripts/programs-helper`, beside `/app/server`. A deployment that lacks the
 * folder answers 404 with a plain sentence; nothing is looked for anywhere else.
 *
 * WHAT IS SERVED. A fixed list of four names, never a name from a request, so no path can be steered. The zip is built
 * here with "stored" entries (no compression): the format is a few dozen bytes of header around each file, so no
 * package is needed. The names, sizes and CRC-32 are the files' own; the time stamp is fixed so the same files always
 * give the same bytes.
 */
import { crc32 } from "node:zlib";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { join } from "node:path";

/** The four files, in the order they are put in the zip. */
export const HELPER_FILES = [
  "FreeDuetProgramsHelper.ps1",
  "setup.ps1",
  "uninstall.ps1",
  "README.md",
] as const;

/** The name the browser saves it under. */
export const HELPER_ZIP_NAME = "freeduet-programs-helper.zip";

export const DEFAULT_HELPER_DIR = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "scripts",
  "programs-helper",
);

/** The most one file, and all four together, may weigh. The real files are about 57 KB and 77 KB in all. */
export const HELPER_FILE_MAX_BYTES = 512 * 1024;
export const HELPER_TOTAL_MAX_BYTES = 1024 * 1024;

/** A file that is not there, or not readable. */
export class HelperFilesMissingError extends Error {}

/**
 * Something is there but is not what the bundle may carry: the folder or a file is a link, a file is not a regular
 * file, or a size cap is passed. The content is never read past that point and never served. `reason` is a fixed word.
 */
export class HelperFilesRefusedError extends Error {
  constructor(
    readonly file: string,
    readonly reason:
      | "folder_is_a_link"
      | "folder_is_not_a_folder"
      | "not_a_regular_file"
      | "too_big"
      | "total_too_big",
  ) {
    super(`${file}: ${reason}`);
  }
}

function u16(value: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(value);
  return b;
}
function u32(value: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value >>> 0);
  return b;
}

/** A zip of already-read files (name, bytes), "stored", with a fixed time stamp (1 January 2026, 00:00). */
export function zipStored(
  files: ReadonlyArray<{ name: string; data: Buffer }>,
): Buffer {
  const DOS_TIME = 0;
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800), // UTF-8 names
      u16(0), // stored
      u16(DOS_TIME),
      u16(DOS_DATE),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data,
    ]);
    centrals.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(DOS_TIME),
        u16(DOS_DATE),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ]),
    );
    locals.push(local);
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  return Buffer.concat([
    ...locals,
    central,
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
}

/**
 * Reads the four files from `directory` and returns the zip. Throws `HelperFilesMissingError` when one is absent and
 * `HelperFilesRefusedError` when one is not a plain regular file inside a plain folder. Each file is opened without
 * following a link (O_NOFOLLOW) and judged by the handle it was opened with, so a swap between the look and the read
 * changes nothing. A folder that is itself a link is refused (the images and a checkout carry a real folder).
 */
export async function buildHelperZip(
  directory: string = DEFAULT_HELPER_DIR,
): Promise<Buffer> {
  let folder: Awaited<ReturnType<typeof lstat>>;
  try {
    folder = await lstat(directory);
  } catch {
    throw new HelperFilesMissingError(directory);
  }
  if (folder.isSymbolicLink())
    throw new HelperFilesRefusedError(".", "folder_is_a_link");
  if (!folder.isDirectory())
    throw new HelperFilesRefusedError(".", "folder_is_not_a_folder");
  const files: Array<{ name: string; data: Buffer }> = [];
  let total = 0;
  for (const name of HELPER_FILES) {
    const path = join(directory, name);
    let entry: Awaited<ReturnType<typeof lstat>>;
    try {
      entry = await lstat(path);
    } catch {
      throw new HelperFilesMissingError(name);
    }
    if (!entry.isFile())
      throw new HelperFilesRefusedError(name, "not_a_regular_file");
    let handle: Awaited<ReturnType<typeof open>>;
    try {
      handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error) {
      // ELOOP: swapped for a link after the look.
      if ((error as NodeJS.ErrnoException).code === "ELOOP")
        throw new HelperFilesRefusedError(name, "not_a_regular_file");
      throw new HelperFilesMissingError(name);
    }
    try {
      const opened = await handle.stat();
      if (!opened.isFile())
        throw new HelperFilesRefusedError(name, "not_a_regular_file");
      if (opened.size > HELPER_FILE_MAX_BYTES)
        throw new HelperFilesRefusedError(name, "too_big");
      total += opened.size;
      if (total > HELPER_TOTAL_MAX_BYTES)
        throw new HelperFilesRefusedError(name, "total_too_big");
      const data = Buffer.alloc(opened.size);
      let read = 0;
      while (read < data.length) {
        const { bytesRead } = await handle.read(
          data,
          read,
          data.length - read,
          read,
        );
        if (bytesRead === 0) break;
        read += bytesRead;
      }
      files.push({ name, data: data.subarray(0, read) });
    } finally {
      await handle.close();
    }
  }
  return zipStored(files);
}
