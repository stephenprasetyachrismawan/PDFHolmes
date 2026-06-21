# Build context = repo root (lihat infra/docker-compose.yml). Workspace pnpm.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# --- deps + build ---
FROM base AS build
# Salin seluruh source (node_modules/dist dikecualikan via .dockerignore).
COPY . .
RUN pnpm install --no-frozen-lockfile
# turbo membangun dependency package (^build) lebih dulu, lalu api.
RUN pnpm turbo run build --filter=@pdfholmes/api
# Pangkas ke production deps + file terbangun.
RUN pnpm --filter @pdfholmes/api --prod deploy /app

# --- runtime ---
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/packages ./packages
EXPOSE 4000
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
