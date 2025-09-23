# Build static web (Vite) and serve via Nginx (Cloud Run ready)

# ---- Builder ----
FROM node:20-alpine AS builder
WORKDIR /web
COPY web/package*.json ./
RUN npm ci || npm install
COPY web ./
# Allow overriding API base at build time
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# ---- Runtime ----
FROM nginx:alpine AS runtime
# Cloud Run default $PORT=8080; nginx config listens on 8080
COPY deploy/nginx/web.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /web/dist /usr/share/nginx/html

# No explicit CMD required; base image starts nginx

