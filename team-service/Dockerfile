# syntax=docker/dockerfile:1.6

FROM node:22-alpine AS dev
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY team-service ./team-service
EXPOSE 3002
CMD ["node", "--watch", "--import", "tsx", "team-service/src/index.ts"]

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY team-service ./team-service
RUN pnpm team:build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/team-service/dist ./team-service/dist
EXPOSE 3002
CMD ["pnpm", "team:start"]
