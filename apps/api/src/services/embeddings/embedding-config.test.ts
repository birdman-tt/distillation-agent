import assert from "node:assert/strict";
import { test } from "node:test";

import { readEmbeddingConfig } from "./embedding-config.js";

test("readEmbeddingConfig defaults to Qwen text-embedding-v4 with 1024 dimensions", () => {
  const previousProvider = process.env.EMBEDDING_PROVIDER;
  const previousModel = process.env.EMBEDDING_MODEL;
  const previousDimensions = process.env.EMBEDDING_DIMENSIONS;
  delete process.env.EMBEDDING_PROVIDER;
  delete process.env.EMBEDDING_MODEL;
  delete process.env.EMBEDDING_DIMENSIONS;

  try {
    assert.deepEqual(readEmbeddingConfig(), {
      provider: "qwen",
      model: "text-embedding-v4",
      dimensions: 1024,
    });
  } finally {
    if (previousProvider === undefined) {
      delete process.env.EMBEDDING_PROVIDER;
    } else {
      process.env.EMBEDDING_PROVIDER = previousProvider;
    }
    if (previousModel === undefined) {
      delete process.env.EMBEDDING_MODEL;
    } else {
      process.env.EMBEDDING_MODEL = previousModel;
    }
    if (previousDimensions === undefined) {
      delete process.env.EMBEDDING_DIMENSIONS;
    } else {
      process.env.EMBEDDING_DIMENSIONS = previousDimensions;
    }
  }
});
