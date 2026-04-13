import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadLocalEnv } from "@hall-of-fame/runtime-env";

test("loadLocalEnv loads .env.local before .env without clobbering existing values", async () => {
  const root = await mkdtemp(join(tmpdir(), "hall-of-fame-env-"));
  const cwd = join(root, "apps", "api");
  const originalApiKey = process.env.DEEPSEEK_API_KEY;
  const originalPort = process.env.APP_PORT;

  try {
    await mkdir(cwd, { recursive: true });
    await writeFile(join(root, ".env"), "DEEPSEEK_API_KEY=from-dot-env\nAPP_PORT=3000\n");
    await writeFile(join(root, ".env.local"), "DEEPSEEK_API_KEY=from-dot-env-local\nAPP_PORT=4000\nWORKER_PORT=3001\n");

    process.env.DEEPSEEK_API_KEY = "from-process";
    delete process.env.WORKER_PORT;
    delete process.env.APP_PORT;

    const result = await loadLocalEnv({ cwd });

    assert.deepEqual(result.loadedFiles, [join(root, ".env"), join(root, ".env.local")]);
    assert.equal(process.env.DEEPSEEK_API_KEY, "from-process");
    assert.equal(process.env.APP_PORT, "4000");
    assert.equal(process.env.WORKER_PORT, "3001");
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = originalApiKey;
    }

    if (originalPort === undefined) {
      delete process.env.APP_PORT;
    } else {
      process.env.APP_PORT = originalPort;
    }

    delete process.env.WORKER_PORT;
    await rm(root, { recursive: true, force: true });
  }
});
