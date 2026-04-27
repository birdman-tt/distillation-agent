import { upsertUserMemoryFact } from "../../db/repositories/chat-retrieval-repository.js";

type UserMemoryFactDraft = {
  factType: "name" | "nickname";
  factValue: string;
  confidence: number;
};

const VALUE_PATTERN = "([^\\s，。！？,.!?；;、：:]{1,20})";
const NAME_PATTERNS = [
  new RegExp(`我叫${VALUE_PATTERN}`, "u"),
  new RegExp(`我的名字(?:是|叫)${VALUE_PATTERN}`, "u"),
];
const NICKNAME_PATTERNS = [
  new RegExp(`外号(?:是|叫)?${VALUE_PATTERN}`, "u"),
  new RegExp(`昵称(?:是|叫)?${VALUE_PATTERN}`, "u"),
];

const normalizeFactValue = (value: string) =>
  value
    .replace(/^["'“”‘’]+|["'“”‘’]+$/gu, "")
    .trim();

const pushFirstMatch = (
  facts: UserMemoryFactDraft[],
  factType: UserMemoryFactDraft["factType"],
  patterns: RegExp[],
  content: string,
) => {
  for (const pattern of patterns) {
    const match = pattern.exec(content);
    const factValue = normalizeFactValue(match?.[1] ?? "");
    if (factValue) {
      facts.push({
        factType,
        factValue,
        confidence: 1,
      });
      return;
    }
  }
};

export const extractUserMemoryFacts = (content: string): UserMemoryFactDraft[] => {
  const facts: UserMemoryFactDraft[] = [];
  pushFirstMatch(facts, "name", NAME_PATTERNS, content);
  pushFirstMatch(facts, "nickname", NICKNAME_PATTERNS, content);

  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.factType}:${fact.factValue}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const runUserMemoryFactExtractionJob = async (
  input: {
    chatId: string;
    sourceMessageId: string;
    content: string;
  },
  deps: {
    upsertFact?: typeof upsertUserMemoryFact;
  } = {},
) => {
  const upsertFact = deps.upsertFact ?? upsertUserMemoryFact;
  const facts = extractUserMemoryFacts(input.content);

  for (const fact of facts) {
    await upsertFact({
      chatId: input.chatId,
      sourceMessageId: input.sourceMessageId,
      factType: fact.factType,
      factValue: fact.factValue,
      confidence: fact.confidence,
    });
  }

  return {
    extractedCount: facts.length,
  };
};
