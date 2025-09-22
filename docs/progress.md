# Project Progress — Stage 3 In Progress

This document captures the current state so the next engineer can continue Stage 3 (Chats + Streaming + Files context) smoothly.

## TL;DR

- Auth: complete (email/password + Google OAuth2).
- Projects & Files (Stage 2): complete.
- Chats & Streaming (Stage 3): implemented end-to-end; UI styling fixed; streaming UX improved; file relevance selection pending.
- Repo: main branch up to date and pushed.

## What’s done so far

### Monorepo & Infra

- Packages: `apps/gateway` (NestJS API), `web` (React SPA). Prisma + PostgreSQL.
- Global hardening: Helmet, CORS (5173), Throttler (100 req/60s), ValidationPipe (whitelist + forbidNonWhitelisted).
- Tailwind v4 wired correctly via `@import "tailwindcss"` and `@tailwindcss/postcss` plugin.

### Data model (Prisma)

- Project(id, userId, name, systemPrompt?, model?, params?)
- File(id, projectId, userId, name, mime, size, storageUrl)
- Chat(id, projectId, userId, title?)
- Message(id, chatId, userId, role['user'|'assistant'|'system'], content, meta?)

### Backend API (NestJS)

- Auth endpoints (as before).
- Projects: create/list/get/patch/delete.
- Files: list/upload/delete (multipart, 10MB limit). Storage path under `uploads/`.
- Chats: create/list under project; get/delete/patch; list messages; create message; SSE streaming.
- Streaming: OpenRouter-compatible streaming; uses `project.model` or default `x-ai/grok-4-fast:free`. Timeout/abort added. Stubbed streaming path if no `OPENROUTER_API_KEY`.

### Frontend (React + Zustand)

- Layout: Sidebar with Projects; when a project is active, a nested Chats section appears (New/Rename/Delete).
- ChatView: transcript, immediate user message injection, assistant placeholder with typing indicator, streaming tokens appended, Stop/Retry and error banner.
- Tailwind v4 styling fixed; composer is sticky at bottom of right pane; lists are bulletless with consistent spacing.

### Tests / Build

- Gateway build and prior e2e suites passing.
- Web builds cleanly.

## How to run

1. Backend

- `pnpm -F gateway start:dev` (PORT defaults to 3000)

2. Frontend

- `pnpm -F web dev` → http://localhost:5173

3. Database

- `pnpm exec prisma migrate dev` (already applied for current schema)

## Environment variables

- `JWT_ACCESS_SECRET` (required)
- `GATEWAY_PUBLIC_URL` (optional; used for OpenRouter headers)
- `WEB_URL` (optional)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (optional for Google OAuth)
- `OPENROUTER_API_KEY` (optional; if absent, a stub stream is used)

## Recent changes (handoff notes)

- Fixed DTO validation for chat creation due to strict global ValidationPipe.
- Implemented PATCH `/chats/:id` for rename; hooked to sidebar actions.
- Introduced SSE timeout/abort and clearer error propagation for OpenRouter.
- Tailwind v4 import fix and removed template `App.css` constraints; full-height layout ensured.
- Added typing indicator + Stop/Retry + error banner in ChatView; immediate user bubble.
- `.gitignore`: added `apps/gateway/uploads/` ignore; ensured `docs` is tracked.

## Known gaps / Stage 3 remaining

- File context to LLM: Build a minimal context builder to select top‑K relevant file chunks from the project and inject into system/context (token-budgeted, with citations). For now, uploaded files are stored but not consulted during chat.
- Friendly model labels: Map model IDs → user-friendly names (e.g., `x-ai/grok-4-fast:free` → `Grok 4 Fast`).
- UX niceties: inline chat rename, better empty states, keyboard shortcuts.
- Safeguards: per-user rate limits for `/chats/:id/stream`, input caps, basic prompt‑injection guards.
- Tests: unit tests for the context builder + e2e covering streaming under ValidationPipe.

## Suggested next steps (in order)

1. Backend: context builder for file relevance (TF‑IDF/keyword match → top‑K chunks → truncate to token budget → inject into messages with citations).
2. Frontend: model label mapping; display friendly model name in header/settings.
3. Backend: endpoint‑specific throttling for `/chats/:id/stream` and clear error messages.
4. Frontend: minor UX polish (inline rename, typing cursor, toasts).
5. Tests: add unit tests for context builder and add an e2e streaming test that exercises the real ValidationPipe.

## API quick reference

See `docs/api.md` for full details. Current major surfaces:

- Auth: `/auth/*`
- Projects: `/projects` CRUD
- Files: `/files` list/upload/delete (query `project_id`)
- Chats: `/projects/:projectId/chats`, `/chats/:id`, `/chats/:id/messages`, `/chats/:id/stream?content=...`

## Repo state

- Branch: `main`
- Remote: https://github.com/umarmk/kanari-chatbot
- Last commit message reflects UI and streaming polish, DTO fix, SSE timeout/abort, project.model usage.

If anything is unclear, the best entry points are:

- Backend: `apps/gateway/src/chats` + `apps/gateway/src/files` + `apps/gateway/src/projects`
- Frontend: `web/src/components/Layout.tsx`, `web/src/pages/ProjectDetails.tsx`, `web/src/pages/ChatView.tsx`
