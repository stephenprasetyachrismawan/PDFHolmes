# Build context = repo root (lihat infra/docker-compose.yml). Workspace pnpm.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# --- deps + build ---
FROM base AS build
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/field-schema/package.json packages/field-schema/
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/api/package.json apps/api/
RUN pnpm install --no-frozen-lockfile
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @pdfholmes/field-schema build \
 && pnpm --filter @pdfholmes/shared-types build \
 && pnpm --filter @pdfholmes/api build
# Pangkas ke production deps.
RUN pnpm --filter @pdfholmes/api --prod deploy /app

# --- runtime ---
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/packages ./packages
EXPOSE 4000
CMD ["node", "dist/main.js"]
