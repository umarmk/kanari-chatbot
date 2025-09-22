# Project Progress — Stage 1 Complete

This document captures the current state so the next engineer can pick up Stage 2 smoothly.

## Summary

- Monorepo ready: NestJS services (gateway, llm-service, worker) and React web app
- Auth implemented end-to-end:
  - Email/password register, login, refresh (rotation), logout
  - Google OAuth2 (Authorization Code + PKCE) with signed httpOnly cookies for state/verifier
- Frontend auth integration:
  - Zustand store with localStorage persistence
  - Axios client with automatic refresh + retry
  - Routes: Sign In, Sign Up, Auth Callback, Protected Home placeholder
- Tests + hardening:
  - Unit tests for auth logic and OAuth callback edge case (7 tests, all passing)
  - Helmet, rate limiting (100 req/60s), env validation via @nestjs/config + Joi

## How to run

1. Backend: `pnpm -F gateway start:dev`
2. Web: `pnpm -F web dev` → http://localhost:5173

## Environment variables

Required

- `JWT_ACCESS_SECRET` — signing key for access JWTs

Recommended/Optional

- `SESSION_SIGNING_KEY` — signing secret for oauth cookies (dev default used if unset)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — for Google OAuth2
- `GATEWAY_PUBLIC_URL` — defaults to `http://localhost:3000`
- `WEB_URL` — defaults to `http://localhost:5173`
- `PORT` — gateway port (default 3000)

## Gateway (NestJS)

- CORS enabled for http://localhost:5173, http://127.0.0.1:5173 (credentials: true)
- Helmet applied
- ThrottlerGuard global limit: 100 req / 60s
- Modules: PrismaModule, AuthModule
- PrismaService connects on module init

Auth endpoints (see docs/api.md for details)

- POST /auth/register
- POST /auth/login
- POST /auth/refresh
- POST /auth/logout
- GET /auth/google/start
- GET /auth/google/callback

Behavior notes

- Refresh rotates the refresh token; clients must store the new one
- Invalid/malformed refresh tokens map to 401 (no 500s)
- OAuth callback returns tokens in URL fragment for SPA pickup

## Web (React)

- Router: react-router-dom
- Store: Zustand (`web/src/store/auth.ts`)
- API client: Axios with 401 interceptor → POST /auth/refresh → retry once
- Pages:
  - `SignIn.tsx` (email/password form + "Continue with Google")
  - `SignUp.tsx` (email/password form + "Continue with Google")
  - `AuthCallback.tsx` (reads hash or query for tokens; stores and redirects)
  - `Protected.tsx` (redirects unauth users)
  - `App.tsx` routes: `/`, `/auth/sign-in`, `/auth/sign-up`, `/auth/callback`
- Tailwind v4 with @tailwindcss/postcss; minimal global CSS, no @apply pitfalls

## Tests

- Command: `pnpm -F gateway test`
- Current: 3 suites, 7 tests, all passing
- Unit tests focus on error mapping and token handling edge cases

## Recent fixes worth knowing

- Tailwind v4 PostCSS plugin: switched to `@tailwindcss/postcss`
- Removed a global `@apply m-0` to avoid v4 utility validation noise
- OAuth callback: robust parsing (hash first, fallback to query) to avoid dev StrictMode timing loops
- Hardening: invalid refresh token → 401, Prisma P2023 mapped to 401, strict UUID validation for sessionId prefix

## Stage 2 — Suggested next steps

1. Domain scaffolding (MVP)

- Define minimal "Project", "Chat", and "Message" models (Prisma + migrations)
- Authenticated CRUD: `/projects` (create/list), `/projects/:projectId/chats` (create/list)
- Messages: `/chats/:chatId/messages` (list) and POST to append a user message and return assistant reply (stub or OpenRouter)
- Ownership checks: scope all queries by userId from JWT

2. LLM plumbing (MVP)

- POST `/chats/:chatId/messages` calls OpenRouter (non‑streaming first; SSE later)

3. Frontend initial chat screen

- Protected route `/projects/:projectId/chats/:chatId` with message list + composer

4. Tests & observability

- e2e: register → login → create project → create chat → post message → 200
- Add pino logger defaults (dev), basic request logging

## Risks / gotchas

- Refresh token rotation: ensure frontend always replaces stored refresh token
- Throttling may throttle aggressive local tests; adjust per-route if needed
- Google OAuth requires consent screen test user; ensure env vars set

## Repo state

- Branch: main
- Pushed to: https://github.com/umarmk/kanari-chatbot
- Docs: `docs/api.md` (API), `docs/progress.md` (this file)

If anything is unclear, check `apps/gateway/src/auth` and `web/src` — they mirror the docs closely.
