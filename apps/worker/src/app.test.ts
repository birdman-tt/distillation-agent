import assert from "node:assert/strict";
import test from "node:test";

import { __internal } from "./app.js";

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

test("persona distill polling defaults on in development", () => {
  withEnv({
    NODE_ENV: "development",
    PERSONA_DISTILL_POLLING_ENABLED: undefined,
  }, () => {
    assert.equal(__internal.isPersonaDistillPollingEnabled(), true);
  });
});

test("persona distill polling stays opt-in in production", () => {
  withEnv({
    NODE_ENV: "production",
    PERSONA_DISTILL_POLLING_ENABLED: undefined,
  }, () => {
    assert.equal(__internal.isPersonaDistillPollingEnabled(), false);
  });
});

test("persona source discovery polling defaults on in development", () => {
  withEnv({
    NODE_ENV: "development",
    PERSONA_SOURCE_DISCOVERY_POLLING_ENABLED: undefined,
  }, () => {
    assert.equal(__internal.isPersonaSourceDiscoveryPollingEnabled(), true);
  });
});

test("persona source discovery polling stays opt-in in production", () => {
  withEnv({
    NODE_ENV: "production",
    PERSONA_SOURCE_DISCOVERY_POLLING_ENABLED: undefined,
  }, () => {
    assert.equal(__internal.isPersonaSourceDiscoveryPollingEnabled(), false);
  });
});

test("persona source discovery polling can be explicitly disabled", () => {
  withEnv({
    NODE_ENV: "development",
    PERSONA_SOURCE_DISCOVERY_POLLING_ENABLED: "false",
  }, () => {
    assert.equal(__internal.isPersonaSourceDiscoveryPollingEnabled(), false);
  });
});
