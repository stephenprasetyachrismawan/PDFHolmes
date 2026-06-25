# Service satu-kali: jalankan migrasi SQL lalu keluar (§5 service `migrate`).
FROM node:22-slim
WORKDIR /app
COPY db/package.json ./
RUN npm install --omit=dev
COPY db/migrate.mjs ./
COPY db/migrations ./migrations
CMD ["node", "migrate.mjs"]
