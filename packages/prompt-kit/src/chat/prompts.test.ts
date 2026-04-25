import assert from "node:assert/strict";
import test from "node:test";

import { buildChatSystemPrompt, buildChatUserPrompt } from "./prompts.js";

test("chat system prompt explicitly requires JSON output for structured responses", () => {
  const prompt = buildChatSystemPrompt({
    displayName: "测试对象",
    previewIntro: "一个克制的人物画像",
    profileSummary: "重判断，轻表演。",
    styleExamples: ["我会先看证据，再决定表达强度。"],
    requiredInferenceLevel: "grounded",
  });

  assert.match(prompt, /json/i);
  assert.match(prompt, /answer/);
  assert.match(prompt, /basisSummary/);
  assert.match(prompt, /inferenceLevel/);
  assert.match(prompt, /conflictDetected/);
  assert.match(prompt, /refusalReason/);
  assert.match(prompt, /不要因为问题没有命中/);
  assert.match(prompt, /不能编造.*具体事实|不能补出.*具体事实/);
  assert.match(prompt, /对象摘要、参考口吻、推荐问题都只是内部风格线索/);
  assert.match(prompt, /不要直接复述原句|重复固定套话/);
});

test("chat system prompt keeps casual replies from over-performing the persona", () => {
  const prompt = buildChatSystemPrompt({
    displayName: "查理·芒格",
    previewIntro: "重判断，也重长期。",
    profileSummary: "强调判断框架、反蠢思维和长期主义。",
    styleExamples: ["别先问收益，先问自己会在哪犯蠢。"],
    requiredInferenceLevel: "inferred",
    replyMode: "CASUAL",
    personaIntensity: "low",
  });

  assert.match(prompt, /普通闲聊/);
  assert.match(prompt, /不要自称.*查理·芒格|不要.*我是.*查理·芒格/);
  assert.match(prompt, /不要强行输出金句|不要每句都显露人物主张/);
});

test("chat system prompt allows domain replies to use persona frameworks", () => {
  const prompt = buildChatSystemPrompt({
    displayName: "查理·芒格",
    previewIntro: "重判断，也重长期。",
    profileSummary: "强调判断框架、反蠢思维和长期主义。",
    styleExamples: ["别先问收益，先问自己会在哪犯蠢。"],
    requiredInferenceLevel: "grounded",
    replyMode: "DOMAIN",
    personaIntensity: "high",
  });

  assert.match(prompt, /领域命中/);
  assert.match(prompt, /可以显露人物主张、判断框架和代表性表达/);
});

test("chat user prompt includes recent turns and retrieved memories before the current message", () => {
  const prompt = buildChatUserPrompt({
    question: "那你刚才说的秩序尺度，展开讲讲。",
    classification: {
      category: "OPEN_ENDED",
      matchedKeyword: null,
      shouldEscalateToModelJudge: true,
    },
    recentTurns: [
      {
        role: "USER",
        content: "你更看重秩序还是效率？",
      },
      {
        role: "ASSISTANT",
        content: "我会先把秩序的尺度定住，再谈效率。",
      },
    ],
    retrievedMemories: [
      {
        role: "ASSISTANT",
        content: "若尺度先乱，后面的效率只会加速失序。",
        reason: "followup_reference",
        turnDistance: 2,
      },
    ],
    evidence: [
      {
        sourceId: "11111111-1111-1111-1111-111111111111",
        title: "资料 1",
        snippet: "强调制度和秩序优先。",
      },
    ],
  });

  assert.match(prompt, /\[Recent Conversation Window\]/);
  assert.match(prompt, /\[Retrieved Chat Memory\]/);
  assert.match(prompt, /\[Persona Evidence\]/);
  assert.match(prompt, /\[Current User Message\]/);
});

test("chat user prompt includes planner context used as responder guidance", () => {
  const prompt = buildChatUserPrompt({
    question: "对了，我叫什么？",
    classification: {
      category: "OPEN_ENDED",
      matchedKeyword: null,
      shouldEscalateToModelJudge: true,
    },
    turnPlan: {
      userIntent: "用户在询问自己此前告诉过的名字",
      contextUsed: ["用户此前说自己叫小雨，外号大铁锤。"],
      replyGoal: "直接回答用户名字，不要假装不知道",
      responseOutline: ["告诉用户：你叫小雨，也可以叫你大铁锤"],
      shouldSendMultipleMessages: false,
      suggestedMessageCount: 1,
      avoidRepeating: [],
    },
    evidence: [],
  });

  assert.match(prompt, /contextUsed=用户此前说自己叫小雨，外号大铁锤。/);
  assert.match(prompt, /告诉用户：你叫小雨，也可以叫你大铁锤/);
});
