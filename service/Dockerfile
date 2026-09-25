FROM node:24-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json ./
COPY drizzle.config.ts ./
COPY drizzle ./drizzle
COPY vitest.config.ts ./
COPY src ./src

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 10000
CMD ["npm", "run", "start"]
