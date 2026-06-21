# Build context = repo root. Next.js 15 (jalankan `next start`).
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --no-frozen-lockfile
# Bangun package dependency dulu.
RUN pnpm --filter @pdfholmes/field-schema build \
 && pnpm --filter @pdfholmes/shared-types build
# NEXT_PUBLIC_* di-inline saat build.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_AUTH_DEV_BYPASS=false
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_AUTH_DEV_BYPASS=$NEXT_PUBLIC_AUTH_DEV_BYPASS
RUN pnpm --filter @pdfholmes/web build

FROM base AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo ./
EXPOSE 3000
CMD ["pnpm", "--filter", "@pdfholmes/web", "start"]
