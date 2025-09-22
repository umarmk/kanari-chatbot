# Kanari API

Minimal, stable auth surface for local dev and early integration. All responses are JSON.

Base URL (dev):

- Gateway: http://localhost:3000
- Web SPA: http://localhost:5173

Auth model:

- Access token: JWT, sent as `Authorization: Bearer <access_token>`
- Refresh token: opaque string: `<sessionId(uuid)>.<randomSuffix>`; rotated on every refresh

Security:

- CORS: localhost:5173 (and 127.0.0.1:5173) allowed
- Helmet: common HTTP security headers
- Throttling: 100 req / 60s per IP (global)

Environment:

- `JWT_ACCESS_SECRET` (required)
- `SESSION_SIGNING_KEY` (cookies for Google PKCE; dev default used if unset)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (optional but needed for Google)
- `GATEWAY_PUBLIC_URL` (default: http://localhost:3000)
- `WEB_URL` (default: http://localhost:5173)

---

## Auth

### POST /auth/register

Create an account with email + password (min 12 chars).

Request

```json
{
  "email": "me@example.com",
  "password": "SuperStrongPassw0rd!"
}
```

Response 200

```json
{
  "access_token": "<jwt>",
  "refresh_token": "<uuid>.<suffix>"
}
```

Errors

- 400 email_already_in_use

PowerShell example

```powershell
$reg = irm -Method Post http://localhost:3000/auth/register `
  -ContentType "application/json" `
  -Body (@{ email="me@example.com"; password="SuperStrongPassw0rd!" } | ConvertTo-Json)
$reg
```

---

### POST /auth/login

Login with email + password.

Request

```json
{ "email": "me@example.com", "password": "SuperStrongPassw0rd!" }
```

Response 200

```json
{ "access_token": "<jwt>", "refresh_token": "<uuid>.<suffix>" }
```

Errors

- 401 invalid_credentials

---

### POST /auth/refresh

Exchange a valid refresh token for a new access + refresh pair. Rotation enforced.

Request

```json
{ "refresh_token": "<uuid>.<suffix>" }
```

Response 200

```json
{ "access_token": "<jwt>", "refresh_token": "<uuid>.<new_suffix>" }
```

Errors

- 401 invalid_refresh_token (malformed, not found, hash mismatch)
- 401 session_expired

Notes

- Client must replace its stored refresh_token with the new value on every refresh.

---

### POST /auth/logout

Invalidate a refresh token (deletes its session). Idempotent.

Request

```json
{ "refresh_token": "<uuid>.<suffix>" }
```

Response 200

```json
{ "success": true }
```

---

## Google OAuth2 (PKCE)

The backend performs Authorization Code with PKCE. A short-lived, signed httpOnly cookie stores state and code_verifier.

### GET /auth/google/start

Redirects the browser to Google for consent.

Query params

- `redirect` (optional): absolute URL to route to after callback (defaults to `WEB_URL`)

Behavior

- Sets cookies: `g_state`, `g_verifier`, (optional) `g_redirect` with 10 min TTL
- Redirects to Google with scopes: `openid email profile`
- Uses `redirect_uri = {GATEWAY_PUBLIC_URL}/auth/google/callback`

Example

- Navigate browser to: `http://localhost:3000/auth/google/start`

---

### GET /auth/google/callback

Google redirects here with `code` and `state`.

Behavior

1. Validates state + cookies
2. Exchanges code at Google token endpoint with `code_verifier`
3. Fetches profile from `https://openidconnect.googleapis.com/v1/userinfo`
4. Upserts user and oauth account
5. Issues `{access_token, refresh_token}`
6. Clears g\_\* cookies, then redirects to SPA with tokens in URL fragment:
   - `{WEB_URL}/auth/callback#access_token=...&refresh_token=...`

Errors

- 400 invalid_callback (missing code/state)
- 400 invalid_state (cookie mismatch/expired)
- 400 token_exchange_failed
- 400 userinfo_failed

Notes

- The SPA at `/auth/callback` should parse the URL fragment and store both tokens.
- On success, the SPA should redirect to a protected page.

---

## Projects

All endpoints require `Authorization: Bearer <access_token>`.

### POST /projects

Create a project.

Request

```json
{
  "name": "My Project",
  "system_prompt": "You are helpful",
  "model": "x-ai/grok-4-fast:free",
  "params": {}
}
```

Response 200

```json
{
  "id": "<uuid>",
  "name": "My Project",
  "model": "x-ai/grok-4-fast:free",
  "createdAt": "..."
}
```

### GET /projects

List projects for current user.

### GET /projects/:id

Get a project by id.

### PATCH /projects/:id

Update fields: `{ name?, system_prompt?, model?, params? }`.

### DELETE /projects/:id

Delete project (cascades chats/files by schema rules).

---

## Files

Files belong to a project. Size limit: 10MB. Stored under `uploads/`.

### GET /files?project_id=<uuid>

List files for a project.

### POST /files?project_id=<uuid>

Multipart upload with field `file`. Response returns the created File record.

### DELETE /files/:id

Delete a file (ownership enforced).

---

## Chats

### POST /projects/:projectId/chats

Create a chat. Body: `{ "title"?: string }` (optional).

### GET /projects/:projectId/chats

List chats under a project (newest first).

### GET /chats/:id

Get chat.

### PATCH /chats/:id

Rename chat. Body: `{ "title"?: string }`.

### DELETE /chats/:id

Delete chat (messages cascade).

### GET /chats/:id/messages

List messages in ascending order.

### POST /chats/:id/messages

Append a user message (non-stream). Body: `{ "content": string }`.

### GET /chats/:id/stream?content=...

Server-Sent Events (SSE) streaming of the assistant reply for the provided prompt.

- Headers: `Authorization: Bearer ...`, `Accept: text/event-stream`
- Stream format: OpenAI-compatible lines: `data: {"choices":[{"delta":{"content":"..."}}]}` and ends with `data: [DONE]`.
- On success, the full assistant message is persisted after stream ends.
- If `OPENROUTER_API_KEY` is not set, a short stub is emitted; clients should tolerate keep-alives and non-JSON noise.

Note: Timeout/abort is applied server-side. Client may cancel by closing connection.

---

## Root

### GET /

Default Hello World (scaffold).

Response 200

```
Hello World!
```

---

## Error format

Standard NestJS JSON error payloads, e.g.

```json
{ "statusCode": 401, "message": "invalid_refresh_token" }
```

---

## Client guidance

- Send `Authorization: Bearer <access_token>` for API calls that require auth
- On 401 from the API client, call `/auth/refresh` with the stored refresh_token, replace both tokens on success, and retry the original request once
- Always rotate refresh token on success
- If refresh fails (401), force a sign-in
