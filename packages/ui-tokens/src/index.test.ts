import assert from "node:assert/strict";
import test from "node:test";

import { uiTokens } from "./index.js";

test("ui tokens describe a mobile-first editorial chat system", () => {
  assert.equal(uiTokens.projectName, "Hall of Fame");
  assert.equal(uiTokens.layout.mobileViewportWidth, 390);
  assert.equal(uiTokens.layout.maxReadableWidth, 780);
  assert.equal(uiTokens.colors.canvas, "#f6f0e7");
  assert.equal(uiTokens.colors.accent, "#9b5c2e");
  assert.equal(uiTokens.typography.display.family, '"Iowan Old Style", "Palatino Linotype", Georgia, serif');
  assert.equal(uiTokens.motion.chatRevealMs, 180);
});
