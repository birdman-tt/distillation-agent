import assert from "node:assert/strict";
import test from "node:test";

import { uiTokens } from "./index.js";

test("ui tokens expose the approved dual-theme consumer colors", () => {
  assert.equal(uiTokens.projectName, "Hall of Fame");
  assert.equal(uiTokens.colors.lightCanvas, "#eef2f8");
  assert.equal(uiTokens.colors.lightSurface, "#f9fbff");
  assert.equal(uiTokens.colors.darkCanvas, "#101315");
  assert.equal(uiTokens.colors.darkSurface, "#1b2126");
  assert.equal(uiTokens.colors.signalBlue, "#3870ff");
  assert.equal(uiTokens.colors.voltGreen, "#b1ff3b");
});

test("ui tokens keep mobile-first layout defaults", () => {
  assert.equal(uiTokens.layout.mobileViewportWidth, 390);
  assert.equal(uiTokens.layout.pagePaddingX, 16);
  assert.ok(uiTokens.layout.shellMaxWidth >= 960);
});
