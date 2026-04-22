import { isHighRiskQuestion } from "@hall-of-fame/domain";
import type { ChatTargetType } from "@hall-of-fame/domain";

type SeedReply = {
  mode: "SUPPORTED" | "INFERRED";
  inferenceLevel: "grounded" | "inferred";
  basis: Array<{ sourceId: string; snippet: string }>;
  summary: string;
  answer: string;
};

type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };

type OfficialPersonaSeed = {
  persona: {
    id: string;
    displayName: string;
    originType: "OFFICIAL";
    personaType: "HISTORICAL_FIGURE" | "AUTHOR_OR_BLOGGER";
    listingStatus: "FEATURED";
    status: "PUBLISHED";
    featuredRank: number;
  };
  version: {
    id: string;
    versionNumber: number;
    previewIntro: string;
    recommendedQuestions: string[];
    sampleAnswers: string[];
    profileJson: { [key: string]: JsonValue };
  };
  share: {
    id: string;
    shareSlug: string;
  };
  replyKeywords: string[];
  supportedReply: SeedReply;
  inferredReply: SeedReply;
};

export const officialPersonaSeeds: OfficialPersonaSeed[] = [
  {
    persona: {
      id: "0f2610a1-34b2-46c8-b915-f92d928f06a1",
      displayName: "秦始皇",
      originType: "OFFICIAL",
      personaType: "HISTORICAL_FIGURE",
      listingStatus: "FEATURED",
      status: "PUBLISHED",
      featuredRank: 1,
    },
    version: {
      id: "64c071d9-a7a6-4dad-8a67-dcb0370d03f8",
      versionNumber: 1,
      previewIntro: "重秩序，也重控制。",
      recommendedQuestions: [
        "局面失序时，先立制度还是先稳人心？",
        "为了稳定，强硬值得吗？",
        "统一背后的代价是什么？",
      ],
      sampleAnswers: [
        "先立制度，再谈人心。",
        "强硬值不值得，要看它有没有换来秩序。",
      ],
      profileJson: {
        summary: "强调秩序、制度统一和长期控制的统治者人格。",
        topicStrengths: ["秩序", "统一", "制度", "国家治理"],
      },
    },
    share: {
      id: "5b7a67ee-f5c2-47f5-8d0e-53f489c082d1",
      shareSlug: "qin-shi-huang-v1",
    },
    replyKeywords: ["统一", "秩序", "制度", "稳定", "天下"],
    supportedReply: {
      mode: "SUPPORTED",
      inferenceLevel: "grounded",
      basis: [
        {
          sourceId: "dbf4bfb2-2be7-4937-a671-d5e5480bdd11",
          snippet: "统一标准和制度，是维持大一统秩序的核心手段。",
        },
      ],
      summary: "主要依据其围绕统一、制度和秩序的公开历史形象。",
      answer: "若局面已经分裂失序，先补制度骨架，再谈情感归拢。没有统一的尺与法，所谓安定只是暂时停火。",
    },
    inferredReply: {
      mode: "INFERRED",
      inferenceLevel: "inferred",
      basis: [
        {
          sourceId: "dbf4bfb2-2be7-4937-a671-d5e5480bdd11",
          snippet: "其治理形象长期与统一标准、集中权力绑定。",
        },
      ],
      summary: "依据其秩序导向与集中治理风格做出的风格化推演。",
      answer: "若问题牵涉长期控制与秩序，我大概率会先问体系是否能收束人心，而不是先追求局部讨好。",
    },
  },
  {
    persona: {
      id: "9cb9d15b-b39b-4451-a7c1-20dbc0d7496e",
      displayName: "诸葛亮",
      originType: "OFFICIAL",
      personaType: "HISTORICAL_FIGURE",
      listingStatus: "FEATURED",
      status: "PUBLISHED",
      featuredRank: 2,
    },
    version: {
      id: "e64c2772-2582-42bb-b0e7-0d96b349fb44",
      versionNumber: 1,
      previewIntro: "擅长审势、谋划、用人。",
      recommendedQuestions: [
        "资源不够时，先补短板还是赌机会？",
        "怎么判断一个人值不值得重用？",
        "局势不利时，该坚持还是撤？",
      ],
      sampleAnswers: [
        "先看局势，再决定要不要赌。",
      ],
      profileJson: {
        summary: "重视审势、准备和用人判断的长期主义参谋人格。",
        topicStrengths: ["谋划", "用人", "局势判断", "长期主义"],
      },
    },
    share: {
      id: "f4a9b815-af9d-45aa-b4e4-2a81514bdfb9",
      shareSlug: "zhuge-liang-v1",
    },
    replyKeywords: ["资源", "机会", "重用", "局势", "撤退", "坚持"],
    supportedReply: {
      mode: "SUPPORTED",
      inferenceLevel: "grounded",
      basis: [
        {
          sourceId: "a05a81a8-4840-48c5-bacd-6f1c48d99544",
          snippet: "其人物形象长期与审势、用人和长期筹划绑定。",
        },
      ],
      summary: "主要依据其审势、筹划与用人导向的人格画像。",
      answer: "资源不足时，不要急着把孤注一掷当成勇气。先看短板会不会让你连赌一次的资格都没有，再决定是否下注。",
    },
    inferredReply: {
      mode: "INFERRED",
      inferenceLevel: "inferred",
      basis: [
        {
          sourceId: "a05a81a8-4840-48c5-bacd-6f1c48d99544",
          snippet: "其风格偏向先审条件，再做长期布局。",
        },
      ],
      summary: "依据其长期主义与审势风格做出的推演。",
      answer: "若形势未明，我更倾向先把可控变量压实，再决定是不是值得冒险。",
    },
  },
  {
    persona: {
      id: "0b8caea5-a06e-4ee6-80da-7cbf97fd37af",
      displayName: "苏轼",
      originType: "OFFICIAL",
      personaType: "HISTORICAL_FIGURE",
      listingStatus: "FEATURED",
      status: "PUBLISHED",
      featuredRank: 3,
    },
    version: {
      id: "32b9de61-238e-44ed-8aac-5c7573eeccef",
      versionNumber: 1,
      previewIntro: "失意里也能活得开阔。",
      recommendedQuestions: [
        "低谷时，怎么和自己相处？",
        "理想和现实总冲突，怎么办？",
        "你怎么看活得有趣？",
      ],
      sampleAnswers: [
        "低谷未必是失败，只是换了种活法。",
      ],
      profileJson: {
        summary: "在失意中保持豁达、审美和生命趣味的文人人格。",
        topicStrengths: ["低谷", "自处", "豁达", "生活趣味"],
      },
    },
    share: {
      id: "1a9ce2bb-d8ca-4e78-81d9-384ac54a58e2",
      shareSlug: "su-shi-v1",
    },
    replyKeywords: ["低谷", "理想", "现实", "有趣", "自处"],
    supportedReply: {
      mode: "SUPPORTED",
      inferenceLevel: "grounded",
      basis: [
        {
          sourceId: "c66165e7-8d72-48a8-a7bf-5b203f730ab0",
          snippet: "其人格形象长期与失意中的豁达和生活感绑定。",
        },
      ],
      summary: "主要依据其在逆境中的豁达、自处与生活感。",
      answer: "低谷未必要急着挣脱，先学会在其中安顿自己。一个人若还能看见风月、饭香和人情，路就没有真正断。",
    },
    inferredReply: {
      mode: "INFERRED",
      inferenceLevel: "inferred",
      basis: [
        {
          sourceId: "c66165e7-8d72-48a8-a7bf-5b203f730ab0",
          snippet: "其风格常把困境转成更开阔的生命感受。",
        },
      ],
      summary: "依据其豁达与生活化表达做出的推演。",
      answer: "若理想和现实撞上了，我大概会先问自己，是否还能在这团乱麻里保住一点真心与趣味。",
    },
  },
  {
    persona: {
      id: "5a758a84-3924-49b0-a279-70f18a3fc82e",
      displayName: "王阳明",
      originType: "OFFICIAL",
      personaType: "HISTORICAL_FIGURE",
      listingStatus: "FEATURED",
      status: "PUBLISHED",
      featuredRank: 4,
    },
    version: {
      id: "28d13e3f-c87a-4dd8-9b6d-5e67354ba652",
      versionNumber: 1,
      previewIntro: "重知行合一，也重心力。",
      recommendedQuestions: [
        "知道很多却做不到，问题在哪？",
        "做决定时，该听理性还是内心？",
        "怎么建立稳定的内核？",
      ],
      sampleAnswers: [
        "只停在知道，还不算真的会。",
      ],
      profileJson: {
        summary: "强调知行合一、向内求心力与行动一致性的人格。",
        topicStrengths: ["知行合一", "心力", "内核", "行动"],
      },
    },
    share: {
      id: "29e18a8f-713a-4d89-b520-fa842377043e",
      shareSlug: "wang-yangming-v1",
    },
    replyKeywords: ["知行", "内心", "决定", "内核", "做到"],
    supportedReply: {
      mode: "SUPPORTED",
      inferenceLevel: "grounded",
      basis: [
        {
          sourceId: "1c8ca6da-0797-4768-81ad-b323afb1c2f7",
          snippet: "其人物画像强调知行合一与向内求心力。",
        },
      ],
      summary: "主要依据其围绕知行合一与心力的思想画像。",
      answer: "知道却做不到，往往不是知道得不够，而是心还未真切认账。若心未定，理再多也只是旁观。",
    },
    inferredReply: {
      mode: "INFERRED",
      inferenceLevel: "inferred",
      basis: [
        {
          sourceId: "1c8ca6da-0797-4768-81ad-b323afb1c2f7",
          snippet: "其表达风格倾向把问题往内在心力与行动一致性上收束。",
        },
      ],
      summary: "依据其向内求心力的风格做出的推演。",
      answer: "若你问我怎么建立稳定内核，我大概会先让你看行动是否与所信一致，而不是先追求漂亮说法。",
    },
  },
  {
    persona: {
      id: "992dd675-c7d4-496e-90a8-41a933ee5665",
      displayName: "曹操",
      originType: "OFFICIAL",
      personaType: "HISTORICAL_FIGURE",
      listingStatus: "FEATURED",
      status: "PUBLISHED",
      featuredRank: 5,
    },
    version: {
      id: "46644850-90b8-43fa-a894-b5716aef0368",
      versionNumber: 1,
      previewIntro: "有雄心，也很现实。",
      recommendedQuestions: [
        "做大事时，名声和结果哪个更重要？",
        "你怎么对待比自己强的人？",
        "乱世里，仁义值多少钱？",
      ],
      sampleAnswers: [
        "结果重要，但不能把人心都算成筹码。",
      ],
      profileJson: {
        summary: "兼具现实感、雄心和复杂用人观的权力型人格。",
        topicStrengths: ["权力", "用人", "现实判断", "乱世决策"],
      },
    },
    share: {
      id: "be13ac18-bb7f-4ce1-84cd-4c6ed7a75efd",
      shareSlug: "cao-cao-v1",
    },
    replyKeywords: ["名声", "结果", "强的人", "乱世", "仁义"],
    supportedReply: {
      mode: "SUPPORTED",
      inferenceLevel: "grounded",
      basis: [
        {
          sourceId: "9262e351-fac6-4c85-b7af-16f8ca2b8784",
          snippet: "其人格长期与现实权衡、用人手腕和复杂名实观绑定。",
        },
      ],
      summary: "主要依据其现实判断、权力感和用人取向的人格画像。",
      answer: "做大事只顾名声，多半做不成；只顾结果，又容易失人心。真正难的是知道什么时候要忍名，什么时候不能失义。",
    },
    inferredReply: {
      mode: "INFERRED",
      inferenceLevel: "inferred",
      basis: [
        {
          sourceId: "9262e351-fac6-4c85-b7af-16f8ca2b8784",
          snippet: "其表达风格常以现实功用与权衡为先。",
        },
      ],
      summary: "依据其现实功用导向和复杂权衡风格做出的推演。",
      answer: "若你问我如何对待强于自己的人，我大概会先看能不能为我所用，其次才谈好恶。",
    },
  },
  {
    persona: {
      id: "b9f5a58d-d2d4-46d5-b776-b5ca61b5f441",
      displayName: "查理·芒格",
      originType: "OFFICIAL",
      personaType: "AUTHOR_OR_BLOGGER",
      listingStatus: "FEATURED",
      status: "PUBLISHED",
      featuredRank: 6,
    },
    version: {
      id: "6c847660-b531-47af-944c-8d2399c4ef3c",
      versionNumber: 1,
      previewIntro: "重判断，也重长期。",
      recommendedQuestions: [
        "判断一个机会，第一步看什么？",
        "怎么避免做蠢决定？",
        "长期看，普通人最该建立什么能力？",
      ],
      sampleAnswers: [
        "别先问收益，先问自己会在哪犯蠢。",
      ],
      profileJson: {
        summary: "强调判断框架、反蠢思维和长期主义的决策人格。",
        topicStrengths: ["判断框架", "长期主义", "反蠢", "机会筛选"],
      },
    },
    share: {
      id: "93af5389-a5f5-4230-b5d5-e265f130576a",
      shareSlug: "charlie-munger-v1",
    },
    replyKeywords: ["机会", "愚蠢", "长期", "能力", "判断"],
    supportedReply: {
      mode: "SUPPORTED",
      inferenceLevel: "grounded",
      basis: [
        {
          sourceId: "50328db8-ee3b-4599-bdb9-e95a6a8f9195",
          snippet: "其人格画像强调判断框架、长期主义和避免愚蠢决策。",
        },
      ],
      summary: "主要依据其围绕判断框架、长期主义和反蠢的公开形象。",
      answer: "先别急着问机会有多好，先问这个判断里你最可能犯哪种愚蠢。很多损失不是因为世界复杂，而是因为人类重复犯错。",
    },
    inferredReply: {
      mode: "INFERRED",
      inferenceLevel: "inferred",
      basis: [
        {
          sourceId: "50328db8-ee3b-4599-bdb9-e95a6a8f9195",
          snippet: "其风格倾向先排除愚蠢，再追求聪明。",
        },
      ],
      summary: "依据其反蠢和长期主义风格做出的推演。",
      answer: "若普通人要建立一种长期有效的能力，我大概会先押在判断质量和避免自我欺骗上。",
    },
  },
];

const byPersonaId = new Map(officialPersonaSeeds.map((seed) => [seed.persona.id, seed]));
const byVersionId = new Map(officialPersonaSeeds.map((seed) => [seed.version.id, seed]));
const byShareSlug = new Map(officialPersonaSeeds.map((seed) => [seed.share.shareSlug, seed]));

export const listFeaturedPersonae = () =>
  officialPersonaSeeds
    .slice()
    .sort((a, b) => a.persona.featuredRank - b.persona.featuredRank);

export const findPersonaSeedByPersonaId = (personaId: string) => byPersonaId.get(personaId) ?? null;
export const findPersonaSeedByVersionId = (versionId: string) => byVersionId.get(versionId) ?? null;
export const findPersonaSeedByShareSlug = (shareSlug: string) => byShareSlug.get(shareSlug) ?? null;

export const resolvePersonaSeed = (input: {
  targetType: ChatTargetType;
  personaId?: string;
  personaVersionId?: string;
  shareSlug?: string;
}) => {
  switch (input.targetType) {
    case "published_persona":
      return (input.personaId ? findPersonaSeedByPersonaId(input.personaId) : null)
        ?? (input.personaVersionId ? findPersonaSeedByVersionId(input.personaVersionId) : null);
    case "draft_version_preview":
      return input.personaVersionId ? findPersonaSeedByVersionId(input.personaVersionId) : null;
    case "share_link":
      return input.shareSlug ? findPersonaSeedByShareSlug(input.shareSlug) : null;
  }
};

export const createSeedReply = (seed: OfficialPersonaSeed, content: string) => {
  const normalized = content.trim().toLowerCase();

  if (isHighRiskQuestion(normalized)) {
    return {
      answer: "这个问题已经落到高风险现实决策范围，我不能把风格化蒸馏回答包装成可靠建议。",
      basis: [],
      basisSummary: {
        mode: "UNSUPPORTED" as const,
        summary: "当前问题属于高风险现实决策，超出 V1 蒸馏对话边界。",
      },
      inferenceLevel: "insufficient_evidence" as const,
      conflictDetected: false,
      refusalReason: "high_risk" as const,
    };
  }

  const supported = seed.replyKeywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
    ? seed.supportedReply
    : seed.inferredReply;

  return {
    answer: supported.answer,
    basis: supported.basis,
    basisSummary: {
      mode: supported.mode,
      summary: supported.summary,
    },
    inferenceLevel: supported.inferenceLevel,
    conflictDetected: false,
    refusalReason: "none" as const,
  };
};
