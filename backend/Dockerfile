# backend/Dockerfile
# Production multi-stage Docker build for Missive SEO Backend API & Workers.

# ─── Stage 1: Build & Dependencies ───────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies if needed
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies and generate Prisma Client
RUN npm ci
RUN npx prisma generate

COPY . .

# ─── Stage 2: Production Runtime ─────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create non-root system user and storage directory
RUN addgroup -S missive && adduser -S missive -G missive
RUN mkdir -p /var/lib/missive-seo/reports /app/storage/reports \
    && chown -R missive:missive /var/lib/missive-seo /app/storage

COPY --from=builder --chown=missive:missive /app/node_modules ./node_modules
COPY --from=builder --chown=missive:missive /app/package*.json ./
COPY --from=builder --chown=missive:missive /app/prisma ./prisma
COPY --from=builder --chown=missive:missive /app/src ./src

USER missive

EXPOSE 5000

CMD ["npm", "start"]
