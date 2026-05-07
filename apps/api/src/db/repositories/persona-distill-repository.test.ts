import assert from "node:assert/strict";
import test from "node:test";

import { __internal } from "./persona-distill-repository.js";

const withEnv = (patch: Record<string, string | undefined>, run: () => void) => {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(patch)) {
    previous.set(key, process.env[key]);
    const value = patch[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

test("Kimi source discovery defaults on in development when Kimi web search is configured", () => {
  withEnv({
    NODE_ENV: "development",
    PERSONA_DISTILL_KIMI_DISCOVERY_ENABLED: undefined,
    KIMI_WEB_SEARCH_ENABLED: "true",
    KIMI_API_KEY: "test-key",
    MOONSHOT_API_KEY: undefined,
  }, () => {
    assert.equal(__internal.shouldUseKimiDiscovery(), true);
  });
});

test("Kimi source discovery stays opt-in in production", () => {
  withEnv({
    NODE_ENV: "production",
    PERSONA_DISTILL_KIMI_DISCOVERY_ENABLED: undefined,
    KIMI_WEB_SEARCH_ENABLED: "true",
    KIMI_API_KEY: "test-key",
    MOONSHOT_API_KEY: undefined,
  }, () => {
    assert.equal(__internal.shouldUseKimiDiscovery(), false);
  });
});

test("synthetic source discovery requires explicit opt-in", () => {
  withEnv({
    NODE_ENV: "development",
    PERSONA_DISTILL_SYNTHETIC_DISCOVERY_ENABLED: undefined,
  }, () => {
    assert.equal(__internal.shouldAllowSyntheticDiscovery(), false);
  });

  withEnv({
    NODE_ENV: "development",
    PERSONA_DISTILL_SYNTHETIC_DISCOVERY_ENABLED: "true",
  }, () => {
    assert.equal(__internal.shouldAllowSyntheticDiscovery(), true);
  });
});
