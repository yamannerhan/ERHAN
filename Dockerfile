FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/ozel-guvenlik/package.json ./artifacts/ozel-guvenlik/
COPY artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/
COPY lib/db/package.json ./lib/db/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY scripts/package.json ./scripts/

RUN pnpm install --no-frozen-lockfile

COPY . .

RUN echo '{"extends": "./tsconfig.base.json"}' > tsconfig.json
RUN pnpm --filter @workspace/ozel-guvenlik build
RUN pnpm --filter @workspace/api-server build

ENV NODE_ENV=production
ENV BASE_PATH=/

EXPOSE 8080

CMD ["node", "scripts/start.mjs"]
