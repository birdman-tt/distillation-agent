import assert from "node:assert/strict";
import test from "node:test";

import { enqueuePersonaVersionEmbeddings } from "./persona-embedding-scheduler.js";

test("enqueuePersonaVersionEmbeddings schedules profile and source embedding jobs", async () => {
  const tasks: Array<() => Promise<void>> = [];
  const calls: string[] = [];

  const result = enqueuePersonaVersionEmbeddings(
    {
      version: {
        id: "11111111-1111-1111-1111-111111111111",
        personaId: "22222222-2222-2222-2222-222222222222",
        profileJson: {
          summary: "重视长期判断。",
        },
        previewIntro: null,
        sampleAnswers: [],
        recommendedQuestions: [],
      },
    },
    {
      isEnabled: () => true,
      runInBackground: (task) => {
        tasks.push(task);
      },
      listSourceDocuments: async () => [
        {
          personaId: "22222222-2222-2222-2222-222222222222",
          personaVersionId: "11111111-1111-1111-1111-111111111111",
          sourceId: "33333333-3333-3333-3333-333333333333",
          documentId: "44444444-4444-4444-4444-444444444444",
          normalizedText: "投资时先看风险。",
        },
      ],
      runProfileJob: async () => {
        calls.push("profile");
        return { embeddedCount: 1 };
      },
      runSourceJob: async () => {
        calls.push("source");
        return { embeddedCount: 1 };
      },
    },
  );

  assert.deepEqual(result, { scheduled: true, reason: null });
  assert.equal(tasks.length, 1);
  await tasks[0]!();
  assert.deepEqual(calls, ["profile", "source"]);
});

test("enqueuePersonaVersionEmbeddings skips when disabled", () => {
  let scheduled = false;
  const result = enqueuePersonaVersionEmbeddings(
    {
      version: {
        id: "11111111-1111-1111-1111-111111111111",
        personaId: "22222222-2222-2222-2222-222222222222",
        profileJson: {},
        previewIntro: null,
        sampleAnswers: [],
        recommendedQuestions: [],
      },
    },
    {
      isEnabled: () => false,
      runInBackground: () => {
        scheduled = true;
      },
    },
  );

  assert.deepEqual(result, { scheduled: false, reason: "disabled" });
  assert.equal(scheduled, false);
});
