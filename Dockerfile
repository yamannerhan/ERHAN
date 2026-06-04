FROM node:22-alpine

RUN npm install -g pnpm@9.15.0

WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/ozel-guvenlik/package.json ./artifacts/ozel-guvenlik/
COPY artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/
COPY lib/db/package.json ./lib/db/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/

RUN pnpm install --no-frozen-lockfile

COPY . .

RUN echo '{"extends": "./tsconfig.base.json"}' > tsconfig.json
RUN pnpm --filter @workspace/api-server build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "artifacts/api-server/dist/index.mjs"]
