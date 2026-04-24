import cors from "@fastify/cors";
import { loadLocalEnv } from "@hall-of-fame/runtime-env";
import Fastify from "fastify";

import { ensureDatabaseSchema } from "./db/bootstrap.js";
import { authRoute } from "./routes/auth.js";
import { chatsRoute } from "./routes/chats.js";
import { feedbackRoute } from "./routes/feedback.js";
import { meRoute } from "./routes/me.js";
import { personaVersionsRoute } from "./routes/persona-versions.js";
import { personaDetailRoute } from "./routes/personae/detail.js";
import { featuredPersonaeRoute } from "./routes/personae/featured.js";
import { personaeManageRoute } from "./routes/personae/manage.js";
import { reviewsRoute } from "./routes/reviews.js";
import { sharesRoute } from "./routes/shares.js";

await loadLocalEnv();

const shouldRunDatabaseBootstrapOnStartup = () => process.env.RUN_DB_BOOTSTRAP_ON_STARTUP !== "false";

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

  app.addHook("onReady", async () => {
    if (shouldRunDatabaseBootstrapOnStartup()) {
      await ensureDatabaseSchema();
    }
  });

  void app.register(authRoute);
  void app.register(meRoute);
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
