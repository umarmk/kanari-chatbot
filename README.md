# Kanari Chatbot

A minimal, API‑first chatbot platform built for fast local development and clean service boundaries. The goal is to provide an ergonomic starter that is production‑lean but not over‑engineered.

## Tech Stack

- Backend: NestJS (Gateway API, Worker, LLM service)
- Frontend: React + Vite + TailwindCSS (SPA)
- Data: PostgreSQL (Prisma ORM), Redis (queues/cache)
- LLM: OpenRouter integration (with model allowlist; supports free and paid keys)
- Auth: JWT (access), opaque refresh tokens, Google OAuth2 (PKCE)
- Tooling: pnpm workspaces (monorepo), Dockerfiles + Compose

## Monorepo Layout

```
.
├─ apps/
│  ├─ gateway        # REST API: auth, projects, files, chats, SSE streaming
│  ├─ llm-service    # LLM orchestration service (decoupled from the API edge)
│  └─ worker         # Background jobs (queue consumers, async tasks)
├─ web/              # React SPA (Vite)
├─ prisma/           # Prisma schema and migrations
├─ deploy/
│  ├─ docker/        # Dockerfiles for each service
│  ├─ compose/       # docker-compose.yml (infra + backend services)
│  └─ nginx/         # Nginx config (optional)
├─ docs/             # API and design docs
└─ package.json      # workspace root
```

## Architecture (Brief)

- Gateway (NestJS)
  - Exposes JSON REST API, SSE for streaming assistant replies
  - Handles auth: email/password + Google OAuth2 (PKCE)
  - Applies security defaults: CORS for local dev, Helmet, request throttling
  - Persists to Postgres via Prisma; uses Redis for ephemeral data/queues
- LLM Service (NestJS)
  - Thin service isolating model calls via OpenRouter
  - Enforces a model allowlist and supports key injection via header for paid use
- Worker (NestJS)
  - Processes async tasks (e.g., long‑running jobs) off the request path
- Frontend (React SPA)
  - Modern, accessible UI with Zustand for state; connects to Gateway API

Ports (dev):

- Gateway API: http://localhost:3000
- Web SPA: http://localhost:5173

See docs/api.md for endpoints and auth details.

## Prerequisites

- Node.js >= 20
- pnpm (v9 recommended)
- Docker (optional, for local Postgres/Redis and containerized services)

## Environment Variables

Create a `.env` file in the repository root. Typical values for local dev:

```
# Core
NODE_ENV=development
GATEWAY_PUBLIC_URL=http://localhost:3000
WEB_URL=http://localhost:5173

# Database / Cache (host differs if run inside Docker)
DATABASE_URL=postgresql://kanari:kanari@localhost:5432/kanari?schema=public
REDIS_URL=redis://localhost:6379

# Auth
JWT_ACCESS_SECRET=replace-with-a-long-random-string
SESSION_SIGNING_KEY=replace-with-a-long-random-string

# Google OAuth (optional for Google sign‑in)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# LLM / Files (optional)
OPENROUTER_API_KEY=
OPENROUTER_STREAM_TIMEOUT_MS=60000
FILE_MAX_BYTES=20971520
```

Notes

- If you run the backend inside Docker Compose, set `DATABASE_URL` and `REDIS_URL` using service names (`postgres`, `redis`) in the container environment. The compose file already does this for you.

## How to Run (Local Dev)

You can run services natively (pnpm) or via Docker Compose. The frontend is typically run locally with Vite.

### Option A: pnpm (native)

1. Install dependencies

```
pnpm install
```

2. Provision infra (Postgres + Redis)

- If you have local Postgres/Redis, ensure they match the `.env` URLs; OR
- Use Docker just for infra:

```
docker compose -f deploy/compose/docker-compose.yml up -d postgres redis
```

3. Migrate database and generate Prisma client

```
pnpm exec prisma migrate dev
pnpm exec prisma generate
```

4. Start backend services (separate terminals)

```
pnpm -F gateway start:dev
pnpm -F llm-service start:dev
pnpm -F worker start:dev
```

5. Start the web app

```
pnpm -F web dev
```

- Web: http://localhost:5173
- API: http://localhost:3000

### Option B: Docker Compose (backend + infra)

This runs Postgres, Redis, and the backend services (Gateway, LLM service, Worker) in containers. The Gateway image runs Prisma migrations on startup.

```
docker compose -f deploy/compose/docker-compose.yml up --build
```

Then start the web app locally:

```
pnpm -F web dev
```

## Common Commands

- Lint (check/fix in each package): `pnpm -F <pkg> lint`
- Test (per service): `pnpm -F <pkg> test`
- Build (per service): `pnpm -F <pkg> build`

## Troubleshooting

- Connection refused to Postgres/Redis
  - Ensure services are running and URLs match (localhost vs container service names)
- Prisma errors on startup
  - Run migrations: `pnpm exec prisma migrate dev`
- Google OAuth callback fails
  - Verify `GATEWAY_PUBLIC_URL`, `WEB_URL`, and Google OAuth credentials; clear PKCE cookies and retry

## Security Notes

- JWT access tokens; refresh tokens are opaque and rotated on use
- CORS restricted to local dev origins by default
- Apply least‑privilege secrets in production; rotate regularly

## License

UNLICENSED (internal scaffolding)
