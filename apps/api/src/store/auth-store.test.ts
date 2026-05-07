import { execFileSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";

const apiRoot = new URL("../../", import.meta.url);

const issueAnonymousUserIdInFreshProcess = (deviceId: string) =>
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--eval",
      `import { issueAnonymousSession } from "./src/store/auth-store.ts"; console.log(issueAnonymousSession(${JSON.stringify(deviceId)}).userId);`,
    ],
    {
      cwd: apiRoot,
      encoding: "utf8",
    },
  ).trim();

test("anonymous device identity survives API process restarts", () => {
  const firstUserId = issueAnonymousUserIdInFreshProcess("h5-browser");
  const secondUserId = issueAnonymousUserIdInFreshProcess("h5-browser");

  assert.equal(secondUserId, firstUserId);
});
