import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";

import { logDistillEvent } from "./distill-logger.js";

test("distill logger writes sanitized structured events", () => {
  const events: Array<{ fields: Record<string, unknown>; message: string }> = [];
  const logger = {
    info(fields: Record<string, unknown>, message: string) {
      events.push({ fields, message });
    },
  };

  logDistillEvent(logger, "info", "persona_distill.tool.started", {
    jobId: "job-1",
    seq: 1,
    toolName: "search_sources",
    input: {
      content: "raw source content",
      visible: "kept",
    },
  });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.message, "persona_distill.tool.started");
  assert.deepEqual(events[0]?.fields, {
    kind: "persona_distill.tool.started",
    jobId: "job-1",
    seq: 1,
    toolName: "search_sources",
    input: {
      content: "[redacted]",
      visible: "kept",
    },
  });
});

test("distill logger never throws into the distill pipeline", () => {
  const logger = {
    warn() {
      throw new Error("logger transport failed");
    },
  };

  assert.doesNotThrow(() => {
    logDistillEvent(logger, "warn", "persona_distill.job.failed", {
      jobId: "job-1",
      errorMessage: "failed",
    });
  });
});

test("distill logger preserves Fastify/Pino logger receiver", async () => {
  const lines: string[] = [];
  const app = Fastify({
    logger: {
      level: "info",
      stream: {
        write(line: string) {
          lines.push(line);
        },
      },
    },
  });

  try {
    logDistillEvent(app.log, "info", "persona_distill.job.started", {
      jobId: "job-1",
      errorMessage: "x".repeat(700),
    });

    assert.equal(lines.length, 1);
    const logLine = JSON.parse(lines[0]!);
    assert.equal(logLine.kind, "persona_distill.job.started");
    assert.equal(logLine.jobId, "job-1");
    assert.match(logLine.errorMessage, /<truncated>$/);
  } finally {
    await app.close();
  }
});
