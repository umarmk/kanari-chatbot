# Multi-stage build for NestJS Gateway (Cloud Run ready)

# ---- Builder ----
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl

# Copy source and Prisma schema
COPY apps/gateway/ ./
COPY prisma ./prisma

# Install deps (include dev for build)
RUN npm ci || npm install

# Generate Prisma client against bundled schema
RUN npx prisma generate --schema=./prisma/schema.prisma

# Build Nest app
RUN npm run build

# ---- Runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy built artifacts and node_modules from builder (includes dev deps for npx prisma migrate deploy)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

# Cloud Run default $PORT is 8080, but the app reads PORT env; we don't EXPOSE here (not required)

# Run migrations (if any) then start
CMD ["sh","-c","npx prisma migrate deploy --schema=./prisma/schema.prisma && node dist/main"]
