import Fastify from "fastify";

import { chatsRoute } from "./routes/chats.js";
import { personaDetailRoute } from "./routes/personae/detail.js";
import { featuredPersonaeRoute } from "./routes/personae/featured.js";

const app = Fastify({ logger: true });

app.get("/health", async () => ({
  ok: true,
  service: "hall-of-fame-api",
}));

await app.register(featuredPersonaeRoute);
await app.register(personaDetailRoute);
await app.register(chatsRoute);

const port = Number(process.env.APP_PORT ?? 3000);

await app.listen({ host: "0.0.0.0", port });
