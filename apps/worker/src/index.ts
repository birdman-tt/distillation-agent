const port = Number(process.env.WORKER_PORT ?? 3001);
const chatModel = process.env.DEEPSEEK_CHAT_MODEL ?? "deepseek-chat";
const reasonerModel = process.env.DEEPSEEK_REASONER_MODEL ?? "deepseek-reasoner";

console.log(
  `[worker] hall-of-fame worker ready on ${port} (source-ingest, distill) using chat=${chatModel} reasoner=${reasonerModel}`,
);
