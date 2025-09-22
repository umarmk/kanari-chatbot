# kanari-chatbot

Minimal, API-first chatbot platform.

Stack: NestJS, React + Tailwind, PostgreSQL, Redis, OpenRouter. Auth with JWT + Google OAuth2 (PKCE). Monorepo managed by pnpm workspaces.

## Monorepo

- apps/
  - gateway (REST auth, Google OAuth2)
  - llm-service (LLM integration service)
  - worker (background jobs)
- web/ (React SPA)
- deploy/ (docker, compose)

## Dev quickstart

1. Copy `.env.example` to `.env` and fill values
2. Install deps: `pnpm install`
3. Start backend: `pnpm -F gateway start:dev`
4. Start web: `pnpm -F web dev`
