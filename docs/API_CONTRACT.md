# API contract used by the app

Read from the Kwala web app (`kwala-intel-fe`) and the Go API (`kwala-intel-app`). Nothing here is invented; anything the web app does not use is not called.

## Auth: Supabase
Email OTP: `signInWithOtp({ email, options:{shouldCreateUser:true} })` then `verifyOtp({ email, token, type:'email' })`.
Phone OTP: `signInWithOtp({ phone })` (E.164) then `verifyOtp({ phone, token, type:'sms' })`.
Session (access + refresh token) is stored in Keychain / Keystore, chunked (`src/auth/secureStorage.ts`). The access token is sent as `Authorization: Bearer <jwt>` to both services. On 401 the app refreshes once and retries; if refresh fails the session is ended locally.

## Go API (`API_BASE_URL`)
- `GET /auth/me/context` -> `{ data: { billing:{plan}, quota:{limit,used,remaining,resets_at,unlimited} } }`. Used for the "N free messages left" caption. Plans: `free | pro | ultra`; unknown means free.

## Chat service (`AI_API_BASE_URL`)
- `POST /api/sessions` body `{ id }` (client-generated UUID, idempotent) -> `{ id, title, created_at, updated_at }`
- `GET /api/sessions` -> `[ {id,title,created_at,updated_at} ]` (no pagination in the web app, none here)
- `GET /api/sessions/:id/messages` -> `[ {id, role:'user'|'assistant', content, created_at, blocks?} ]`
- `DELETE /api/sessions/:id`
- `POST /api/chat/:sessionId` body `{ message }`, `Accept: text/event-stream`. Lines `data: {"type":..., "content":...}`:
  `status`, `token` (text delta), `block` (object), `blocks_reset`, `session_title`, `error`, `done`. Other types (`activity`, `thinking`, `chart`) are ignored.
  Errors before the stream: `402` / code `QUOTA_EXCEEDED` (with `used`, `limit`, `reset_at`), `429` throttle, `401/403` auth, `5xx`.

Not supported by the backend (so not implemented): delivery receipts, server-side idempotency keys for chat turns, history pagination, resumable streams.
