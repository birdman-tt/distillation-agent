import cors from "@fastify/cors";
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

export const buildApiApp = () => {
  const app = Fastify({ logger: true });

  void app.register(cors, {
    origin: true,
    credentials: false,
  });

  app.get("/health", async () => ({
    ok: true,
    service: "hall-of-fame-api",
  }));

  void app.register(authRoute);
  void app.register(featuredPersonaeRoute);
  void app.register(personaDetailRoute);
  void app.register(personaeManageRoute);
  void app.register(personaVersionsRoute);
  void app.register(chatsRoute);
  void app.register(sharesRoute);
  void app.register(reviewsRoute);
  void app.register(feedbackRoute);

  return app;
};
