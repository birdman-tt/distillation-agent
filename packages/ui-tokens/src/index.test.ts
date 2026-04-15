import assert from "node:assert/strict";
import test from "node:test";

import { uiTokens } from "./index.js";

test("ui tokens expose role-based private chat colors", () => {
  assert.equal(uiTokens.projectName, "Hall of Fame");
  assert.equal(uiTokens.colors.canvas, "#0f1115");
  assert.equal(uiTokens.colors.chrome, "#14171d");
  assert.equal(uiTokens.colors.assistantSurface, "#1b1f27");
  assert.equal(uiTokens.colors.userBubble, "#8f6376");
  assert.equal(uiTokens.colors.action, "#d88aa4");
});

test("ui tokens keep mobile-first chat layout defaults", () => {
  assert.equal(uiTokens.layout.mobileViewportWidth, 390);
  assert.equal(uiTokens.layout.pagePaddingX, 16);
  assert.ok(uiTokens.layout.shellMaxWidth >= 960);
});
