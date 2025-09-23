# Multi-stage build for LLM Service (NestJS)

FROM node:20-alpine AS builder
WORKDIR /app
COPY apps/llm-service/ ./
RUN npm ci || npm install
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
CMD ["node","dist/main"]
