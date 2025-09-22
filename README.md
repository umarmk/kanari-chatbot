# Kanari Chatbot Platform (Monorepo)

Minimal-yet-scalable, API-first chatbot platform. Stack: NestJS, React + Tailwind, PostgreSQL, Redis, OpenRouter. Designed for Azure Container Apps (demo) with AKS/KeyVault path later.

## Monorepo Layout (planned)
- apps/
  - gateway (REST + SSE)
  - llm-service (OpenRouter streaming)
  - worker (usage aggregation)
- web/ (React SPA)
- packages/
  - shared (DTOs, event schemas)
- deploy/
  - docker, compose, azure

## Getting Started (local)
1. Copy `.env.example` to `.env` and fill values.
2. Start infra & placeholders with Docker Compose:
   - `docker compose -f deploy/compose/docker-compose.yml up -d`
3. Scaffolding of apps will be generated with Nest CLI and Vite in the next step.

## Notes
- Client will use JWT and Google OAuth2; no cookies; server-side session storage will be added.
- Event-driven; Redis Pub/Sub first; Azure Service Bus later.
- Frontend state: Zustand; design palette: light yellow + white.

