import { buildH5Server } from "./h5-app.js";

const app = buildH5Server();
const port = Number(process.env.H5_PORT ?? 3100);

await app.listen({ host: "0.0.0.0", port });
