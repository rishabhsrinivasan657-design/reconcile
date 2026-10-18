# One image for the API, the worker, the website, and one-off tasks (migrations, demo data).
# Built on the server from the deployed commit (ADR-0015).
FROM node:24-bookworm-slim

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    PUPPETEER_SKIP_DOWNLOAD=true \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=true
RUN corepack enable
WORKDIR /app

# Install dependencies first, so code changes don't redo this step.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY evals/package.json evals/
COPY packages/api-client/package.json packages/api-client/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/extraction/package.json packages/extraction/
COPY packages/generator/package.json packages/generator/
COPY packages/llm/package.json packages/llm/
COPY packages/mcp/package.json packages/mcp/
COPY packages/pipeline/package.json packages/pipeline/
COPY packages/db/prisma packages/db/prisma
COPY packages/db/prisma.config.ts packages/db/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @reconcile/db exec prisma generate

# The website forwards /api to the API container (Caddy does too, in front of it).
ENV API_URL=http://api:3001
RUN pnpm --filter @reconcile/web build
