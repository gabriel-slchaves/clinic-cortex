# syntax=docker/dockerfile:1.6

FROM node:22-alpine AS dev
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY whatsapp-service ./whatsapp-service
EXPOSE 3001
CMD ["pnpm", "whatsapp:dev"]

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY whatsapp-service ./whatsapp-service
RUN pnpm whatsapp:build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/whatsapp-service/dist ./whatsapp-service/dist
EXPOSE 3001
CMD ["pnpm", "whatsapp:start"]
