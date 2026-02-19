# Kanari Chatbot

Kanari (pronounced as canary) is a full-stack, production-ready  AI chatbot web app with a clean web interface and a secure backend. Users can sign in, create projects, upload files, and chat in real-time with fast LLM models provided by OpenRouter, while provider API keys stay safely on the server. It’s built for reliability and growth with streaming responses, rate limiting, usage tracking, and an event-driven architecture for scalability.
Built with NestJS (backend), React + Vite + Tailwind (frontend), PostgreSQL/Prisma (data), and Redis (caching/queues).

<img width="1919" height="909" alt="image" src="https://github.com/user-attachments/assets/cc094a66-1af3-49e8-b6df-61e25b407ff1" />

## Tech Stack

- Backend: NestJS (Gateway API)
- Frontend: React + Vite + TailwindCSS (SPA)
- Data: PostgreSQL (Prisma ORM), Redis (refresh sessions)
- LLM: OpenRouter (streaming chat completions)
- Auth: JWT (access), opaque refresh tokens (Redis), Google OAuth2 (PKCE)
- Tooling: pnpm workspaces, Docker + Compose

## Monorepo Layout

```
.
├─ apps/
│  └─ gateway        # REST API: auth, projects, files, chats, SSE streaming
├─ web/              # React SPA (Vite)
├─ prisma/           # Prisma schema and migrations
├─ deploy/           # infra helpers (docker/compose/etc.)
├─ docs/             # API and design docs
└─ package.json      # workspace root
```

## Local Dev

Ports:
- Gateway API: `http://localhost:3000`
- Web SPA: `http://localhost:5173`

### Prerequisites

- Node.js >= 20
- pnpm (v9 recommended)
- Docker (optional, for local Postgres/Redis)

### Environment variables

Create a `.env` file in the repository root (see `docs/api.md` for details):

```
NODE_ENV=development
PORT=3000

# Public URLs
GATEWAY_PUBLIC_URL=http://localhost:3000
WEB_URL=http://localhost:5173

# Database / Cache
DATABASE_URL=postgres://postgres:password@localhost:5432/kanari
REDIS_URL=redis://localhost:6379

# Auth
JWT_ACCESS_SECRET=replace-with-a-long-random-string
SESSION_SIGNING_KEY=replace-with-a-long-random-string

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# OpenRouter (optional for free models)
OPENROUTER_API_KEY=
OPENROUTER_STREAM_TIMEOUT_MS=60000

# Upload / context tuning (optional)
FILE_MAX_BYTES=20971520
CONTEXT_MAX_CHUNKS=6
CONTEXT_MAX_CHARS_PER_CHUNK=1200
```

Notes:
- `DATABASE_URL` is required (validated at startup).
- `WEB_URL` may be a comma-separated list of allowed CORS origins; the first entry is used as the OAuth redirect base in production.
- In production, `WEB_URL` and `SESSION_SIGNING_KEY` are required.
- Models are allowlisted by the backend (`GET /models`). `Project.model` must be an allowed id (`400 invalid_model` otherwise).
- Free models: Gateway uses `OPENROUTER_API_KEY` (server key) if set; otherwise emits a short stub stream for local dev.
- Paid models: client must provide `x-openrouter-key` (stored locally in the browser); Gateway never uses the server key for paid models.
- Google OAuth (PKCE): `/auth/google/start?redirect=...` only accepts safe relative paths (must start with `/`). Absolute URLs are ignored.
- Uploaded files are stored under `uploads/`; deleting a project best-effort deletes its files from disk to avoid orphans.

### Run with pnpm

1) Install deps
```
pnpm install
```

2) Start infra (optional, via Docker)
```
docker compose -f deploy/compose/docker-compose.yml up -d postgres redis
```

3) Migrate DB + generate Prisma client
```
pnpm exec prisma migrate dev --schema=prisma/schema.prisma
pnpm exec prisma generate --schema=prisma/schema.prisma
```

4) Start Gateway
```
pnpm -F gateway start:dev
```

5) Start Web
```
pnpm -F web dev
```

### Run with Docker Compose (backend + infra)

```
docker compose -f deploy/compose/docker-compose.yml up --build
```

Then start the web app locally:
```
pnpm -F web dev
```

## Common Commands

- Gateway tests: `pnpm -F gateway test`
- Gateway build: `pnpm -F gateway build`
- Web build: `pnpm -F web build`

## Security Notes

- Paid models require OpenRouter key (`x-openrouter-key`); server key is only used for free models.
- OAuth redirect hardening: `/auth/google/start?redirect=...` only accepts relative paths like `/auth/callback`.
- Tokens are currently stored in browser `localStorage` (see `web/src/store/auth.ts`).
=======
- JWT access tokens; refresh tokens are opaque and rotated on use
- CORS restricted to local dev origins by default
- Apply least‑privilege secrets in production; rotate regularly
