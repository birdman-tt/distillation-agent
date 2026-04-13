import Fastify from "fastify";

import { authRoute } from "./routes/auth.js";
import { chatsRoute } from "./routes/chats.js";
import { feedbackRoute } from "./routes/feedback.js";
import { personaVersionsRoute } from "./routes/persona-versions.js";
import { personaDetailRoute } from "./routes/personae/detail.js";
import { featuredPersonaeRoute } from "./routes/personae/featured.js";
import { personaeManageRoute } from "./routes/personae/manage.js";
import { reviewsRoute } from "./routes/reviews.js";
import { sharesRoute } from "./routes/shares.js";

const app = Fastify({ logger: true });

app.get("/health", async () => ({
  ok: true,
  service: "hall-of-fame-api",
}));

await app.register(authRoute);
await app.register(featuredPersonaeRoute);
await app.register(personaDetailRoute);
await app.register(personaeManageRoute);
await app.register(personaVersionsRoute);
await app.register(chatsRoute);
await app.register(sharesRoute);
await app.register(reviewsRoute);
await app.register(feedbackRoute);

const port = Number(process.env.APP_PORT ?? 3000);

await app.listen({ host: "0.0.0.0", port });
