# Kanari Chatbot — Architecture

## Monorepo layout
```
/ (pnpm workspace root)
├─ apps/gateway       # NestJS HTTP API (backend)
├─ web                # Vite + React SPA (frontend)
├─ prisma             # Prisma schema & migrations (shared)
└─ deploy/...         # infra helpers (optional)
```

## High-level view
The app is a classic SPA + API split.
- Frontend (Netlify): Vite/React SPA served as static files; calls Gateway via REST/JSON.
- Backend (Render/Cloud Run/etc.): NestJS service exposing auth, projects, chats, files.
- Database (Neon Postgres): persistence via Prisma ORM.

```mermaid
flowchart LR
  A[Browser SPA] -- Axios -> B[Gateway (NestJS)]
  B -- Prisma -> C[(Postgres)]
  A <-- OAuth redirect --> G[Google OAuth]
```

## Frontend (web)
- Stack: React 19, Vite 7, React Router, Zustand, Tailwind.
- API: axios instance with baseURL from `import.meta.env.VITE_API_URL`; `withCredentials: true`.
- Auth:
  - Access token (JWT, 15m) stored in memory (Zustand).
  - Axios interceptor auto-attaches `Authorization: Bearer <token>` and performs 401 refresh with `/auth/refresh` using a refresh token.
- Routing: SPA fallback via Netlify `_redirects` or `netlify.toml`.
- Build output: `web/dist`.
- Required env: `VITE_API_URL` (e.g., `https://<gateway-host>`).

## Backend (apps/gateway)
- Framework: NestJS 11 with modules:
  - `AuthModule` (local auth + Google OAuth),
  - `ProjectsModule`, `FilesModule`, `ChatsModule`,
  - `PrismaModule` (DB access) and `ConfigModule` (env & Joi validation).
- Middleware/security: Helmet, cookie‑parser (signed cookies for OAuth), global ValidationPipe, CORS (origins from `WEB_URL`), throttling (`@nestjs/throttler`).
- Auth design:
  - Access: JWT signed with `JWT_ACCESS_SECRET`, 15 minutes.
  - Refresh: opaque token `sessionId.random` (not JWT). Server stores Argon2 hash in `Session` table; rotation on refresh; 7‑day expiry.
  - Endpoints: `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`.
  - Google OAuth: `/auth/google/start` and `/auth/google/callback` using PKCE; after callback, SPA is redirected to `/auth/callback#<tokens>`.
- Files: metadata in DB; binary files saved to `./uploads` directory (ephemeral in many hosts; move to object storage for production longevity).
- Health: `GET /` returns a simple string.

### Required backend env vars
- `DATABASE_URL` (Postgres connection; with Neon use pooled URL with `?sslmode=require&pgbouncer=true&connection_limit=1`).
- `JWT_ACCESS_SECRET`, `SESSION_SIGNING_KEY`.
- `WEB_URL` (comma‑separated allowed origins for CORS; set to your Netlify URL).
- `GATEWAY_PUBLIC_URL` (public base URL used for OAuth callbacks).
- Optional: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPENROUTER_API_KEY`, `PORT`.

## Database (Prisma + Postgres)
- Schema in `prisma/schema.prisma`; migration history in `prisma/migrations`.
- Key entities: `User`, `OauthAccount`, `Session`, `Project`, `File`, `Chat`, `Message`.
- Migrations applied with `prisma migrate deploy` during CI/CD.

## Deployment
- Frontend (Netlify):
  - Package directory: `web`
  - Build: `pnpm -F web build`
  - Publish: `web/dist`
  - Env: `VITE_API_URL=https://<gateway>`
- Backend (Render example):
  - Build:
    ```bash
    corepack enable
    corepack prepare pnpm@9.0.0 --activate
    pnpm install --frozen-lockfile
    pnpm -F gateway build
    pnpm exec prisma generate
    pnpm exec prisma migrate deploy --schema=prisma/schema.prisma
    ```
  - Start: `pnpm -F gateway start:prod`
  - Env: set variables listed above.

## Local development
- Frontend: `pnpm -F web dev` (http://localhost:5173).
- Backend: `pnpm -F gateway start:dev` (http://localhost:3000). Reads `.env` (do not commit secrets).
- DB: start a Postgres locally or point `DATABASE_URL` to Neon.

## Security considerations
- Secrets in `.env` must never be committed; prefer environment managers in CI/CD.
- TLS only; cookies set by OAuth are HttpOnly + signed.
- Rate limiting enabled; input validation via `class-validator` and Nest `ValidationPipe`.
- Passwords hashed with Argon2id.

## Future/optional services
- `apps/llm-service`, `apps/worker` are scaffolds not required for current scope. If enabled later, they should integrate via job queue and share DB access via Prisma.

