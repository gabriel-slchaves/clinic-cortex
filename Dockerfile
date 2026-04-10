# syntax=docker/dockerfile:1.6

# --- Dev image (optional) ----------------------------------------------------
FROM node:22-alpine AS dev
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
EXPOSE 3000
CMD ["pnpm", "dev", "--host", "0.0.0.0", "--port", "3000"]

# --- Build (production) ------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Vite replaces env vars at build time. Pass them in as build args.
ARG VITE_APP_ENV
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_PUBLIC_LANDING_ORIGIN
ARG VITE_PUBLIC_APP_ORIGIN
ARG VITE_INTERNAL_SERVICE_ORIGIN
ENV VITE_APP_ENV=$VITE_APP_ENV
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_PUBLIC_LANDING_ORIGIN=$VITE_PUBLIC_LANDING_ORIGIN
ENV VITE_PUBLIC_APP_ORIGIN=$VITE_PUBLIC_APP_ORIGIN
ENV VITE_INTERNAL_SERVICE_ORIGIN=$VITE_INTERNAL_SERVICE_ORIGIN

RUN pnpm build

# --- Runtime (nginx) ---------------------------------------------------------
FROM nginx:1.27-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/public /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

