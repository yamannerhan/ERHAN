FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/ozel-guvenlik/package.json ./artifacts/ozel-guvenlik/
COPY artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/
COPY lib/db/package.json ./lib/db/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY scripts/package.json ./scripts/
RUN pnpm install --frozen-lockfile
COPY . .
RUN echo '{"extends": "./tsconfig.base.json"}' > tsconfig.json
RUN pnpm --filter @workspace/ozel-guvenlik build
RUN pnpm --filter @workspace/api-server build

FROM node:22-bookworm-slim AS runtime
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate \
    && apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      dumb-init \
      fonts-liberation \
      fonts-noto-color-emoji \
      ca-certificates \
      dbus \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libgbm1 \
      libgtk-3-0 \
      libnspr4 \
      libnss3 \
      libx11-xcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxrandr2 \
      xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p \
      /app/uploads/avatars \
      /app/uploads/parttime \
      /app/uploads/listing-images \
      /app/uploads/banner-images \
      /app/data/company-logos \
      /app/data/known-company-logos \
      /app/.wwebjs_auth \
    && chown -R node:node /app/uploads /app/data /app/.wwebjs_auth

ENV NODE_ENV=production
ENV BASE_PATH=/
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/readyz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "scripts/start.mjs"]
