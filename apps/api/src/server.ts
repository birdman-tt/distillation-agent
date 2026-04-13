import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/health", async () => ({
  ok: true,
  service: "hall-of-fame-api",
}));

const port = Number(process.env.APP_PORT ?? 3000);

await app.listen({ host: "0.0.0.0", port });
