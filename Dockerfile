FROM node:22-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN corepack enable

WORKDIR /app

FROM base AS build

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM base AS prod-deps

COPY . .

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM node:22-bookworm-slim AS runtime-base

ENV NODE_ENV=production

WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/apps ./apps
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/src/db/schema.sql ./apps/api/dist/db/schema.sql

FROM runtime-base AS api-runtime

RUN node -e "const fs=require('fs'); const path=require('path'); for (const dir of fs.readdirSync('./packages')) { const file=path.join('./packages', dir, 'package.json'); const pkg=JSON.parse(fs.readFileSync(file, 'utf8')); pkg.types='./dist/index.d.ts'; pkg.exports={'.':{types:'./dist/index.d.ts',default:'./dist/index.js'}}; fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n'); }"

CMD ["node", "apps/api/dist/server.js"]

FROM runtime-base AS worker-runtime

RUN node -e "const fs=require('fs'); const path=require('path'); for (const dir of fs.readdirSync('./packages')) { const file=path.join('./packages', dir, 'package.json'); const pkg=JSON.parse(fs.readFileSync(file, 'utf8')); pkg.types='./dist/index.d.ts'; pkg.exports={'.':{types:'./dist/index.d.ts',default:'./dist/index.js'}}; fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n'); }"

CMD ["node", "apps/worker/dist/index.js"]

FROM runtime-base AS h5-runtime

RUN node -e "const fs=require('fs'); const path=require('path'); for (const dir of fs.readdirSync('./packages')) { const file=path.join('./packages', dir, 'package.json'); const pkg=JSON.parse(fs.readFileSync(file, 'utf8')); pkg.types='./dist/index.d.ts'; pkg.exports={'.':{types:'./dist/index.d.ts',default:'./dist/index.js'}}; fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n'); }"

CMD ["node", "apps/client/dist/dev-h5.js"]

FROM runtime-base AS migrate-runtime

RUN node -e "const fs=require('fs'); const path=require('path'); for (const dir of fs.readdirSync('./packages')) { const file=path.join('./packages', dir, 'package.json'); const pkg=JSON.parse(fs.readFileSync(file, 'utf8')); pkg.types='./dist/index.d.ts'; pkg.exports={'.':{types:'./dist/index.d.ts',default:'./dist/index.js'}}; fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n'); }"

CMD ["node", "apps/api/dist/migrate.js"]
