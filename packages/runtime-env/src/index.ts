import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { parse } from "dotenv";

const DEFAULT_FILENAMES = [".env", ".env.local"];

const canAccess = async (path: string) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const findCandidateDirectories = async (cwd: string) => {
  const directories: string[] = [];
  let current = resolve(cwd);

  while (true) {
    directories.push(current);
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return directories;
};

export const loadLocalEnv = async (input: {
  cwd?: string;
  filenames?: string[];
  overrideExisting?: boolean;
} = {}) => {
  const cwd = input.cwd ?? process.cwd();
  const filenames = input.filenames ?? DEFAULT_FILENAMES;
  const overrideExisting = input.overrideExisting ?? false;
  const originalKeys = new Set(Object.keys(process.env));
  const directories = await findCandidateDirectories(cwd);
  const loadedFiles: string[] = [];

  let targetDirectory: string | null = null;
  for (const directory of directories) {
    const hasAny = await Promise.all(filenames.map((filename) => canAccess(join(directory, filename)))).then((matches) =>
      matches.some(Boolean),
    );
    if (hasAny) {
      targetDirectory = directory;
      break;
    }
  }

  if (!targetDirectory) {
    return { loadedFiles };
  }

  for (const filename of filenames) {
    const path = join(targetDirectory, filename);
    if (!(await canAccess(path))) {
      continue;
    }

    const file = await readFile(path, "utf8");
    const parsed = parse(file);

    for (const [key, value] of Object.entries(parsed)) {
      if (overrideExisting) {
        process.env[key] = value;
        continue;
      }

      if (originalKeys.has(key)) {
        continue;
      }

      process.env[key] = value;
    }

    loadedFiles.push(path);
  }

  return { loadedFiles };
};
