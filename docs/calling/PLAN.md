# Plan: WhatsApp Calling (inbound voice) for wacrm

## Context
The user runs a self-hosted fork of wacrm (`ai-related/wacrm`, origin `pravindev12/wacrm`) as the team's WhatsApp CRM. They want a **calling feature like other WhatsApp CRMs** — agents able to take voice calls from customers directly inside the CRM, plus a call history.

Meta shipped the **WhatsApp Business Calling API** (VoIP over WebRTC) in 2025. It works on Cloud API numbers (which this fork uses). We will build it as a **fork-local feature** (not an upstream PR — per `CONTRIBUTING.md`, new features belong in the fork).

**Scope decisions (confirmed with user):**
- **Inbound first** — agents answer calls customers place to the business number. (Outbound/business-initiated needs Meta's 2,000-conversation messaging tier + a Call Permission Request; deferred to a later phase.)
- **Browser softphone (WebRTC)** — agents talk inside wacrm via `getUserMedia` + `RTCPeerConnection`. No SIP/PBX.
- **STUN-only for now** (Google STUN). TURN server to be added before real team use (flagged in Phase 6).

**Outcome:** A customer calls the WhatsApp number → wacrm shows an incoming-call alert → an agent clicks Answer → two-way audio in the browser → call ends → a logged call entry appears in the conversation and a Calls view.

---

## Architecture recap (existing patterns to reuse)
- **Webhook ingestion:** `src/app/api/whatsapp/webhook/route.ts` → `processWebhook()` dispatches by `change.field` / `value.*`. HMAC verified by `verifyMetaWebhookSignature()` (`src/lib/whatsapp/webhook-signature.ts`). Config resolved by `phone_number_id` via `supabaseAdmin()`; token via `decrypt()` (`src/lib/whatsapp/encryption.ts`).
- **Meta API client:** `src/lib/whatsapp/meta-api.ts` — named-param helpers, base `https://graph.facebook.com/v21.0`. Add call-control helpers here.
- **Authed API routes:** use `requireRole("agent")` + `toErrorResponse()` from `src/lib/auth/account.ts`; scope every query by `account_id`.
- **DB/RLS:** migrations in `supabase/migrations/` (next is `027_`). Multi-tenant tables carry `account_id` + RLS via `is_account_member(account_id, min_role)`.
- **Realtime:** `src/hooks/use-realtime.ts` subscribes to `postgres_changes`; extend for `call_logs`.
- **Inbox UI:** `src/components/inbox/message-thread.tsx` (header = place for call button + active-call widget), `message-bubble.tsx` (render call-log entries inline), `message-composer.tsx` (pattern reference).

---

## Phases (build & verify one by one)

### Phase 0 — Meta enablement (no code; user does in dashboard)
- Move off the **test number** to the real migrated number, app in **Live** mode (already a pending item in `wacrm-migration/`).
- In the Meta app, **subscribe the app to the `calls` webhook field** (WhatsApp → Configuration → Webhook fields) and enable **Calling** on the phone number (WhatsApp Manager → Phone number → Calling).
- Confirm `META_APP_SECRET` is set (already required for webhooks).
- *Until done, Phases 1–5 can be developed/tested with mocked webhook payloads + `WHATSAPP_TEMPLATES_DRY_RUN`-style stubbing.*

### Phase 1 — Data model + call-event ingestion (foundation, low risk)
- **New migration** `supabase/migrations/027_whatsapp_calling.sql`: `call_logs` table — `account_id`, `conversation_id`, `contact_id`, `meta_call_id`, `direction` (`inbound`/`outbound`), `status` (`ringing|connected|completed|missed|declined|failed`), `answered_by_user_id`, `started_at`, `answered_at`, `ended_at`, `duration_seconds`, `end_reason`, timestamps. Indexes on `account_id`, `conversation_id`, partial index on active statuses. RLS mirroring the `messages`/`conversations` policies (`is_account_member`).
- **Webhook:** in `processWebhook()` add a `value.calls` branch. Because the current config lookup sits *after* the `if (!value.messages) continue` guard, refactor so config-by-`phone_number_id` is resolved when **either** `calls` or `messages` is present. New handler `handleCallEvent()` (new file `src/lib/whatsapp/call-events.ts`) maps Meta call events (`connect`/`terminate`/status) → upsert `call_logs` row (matched on `meta_call_id`), resolving/creating the contact + conversation with the same helpers `processMessage()` uses.
- Extend webhook TypeScript interfaces with a `calls` shape (`id`, `from`, `to`, `event`, `direction`, `timestamp`, `session.sdp`, `session.sdp_type`, `status`).
- **Verify:** POST a recorded Meta call webhook (sample JSON) to `/api/whatsapp/webhook` with a valid HMAC sig → a `call_logs` row appears; status transitions on follow-up events. (Add a vitest for `handleCallEvent` reducer logic.)

### Phase 2 — Meta call-control API helpers + routes
- **`meta-api.ts`:** add `manageCall({ phoneNumberId, accessToken, callId, action, sdp? })` posting to `POST /{phoneNumberId}/calls` with `action` ∈ `pre_accept | accept | reject | terminate` (and `connect` later for outbound). Returns Meta's response/SDP answer where applicable.
- **API routes** (under `src/app/api/whatsapp/calls/`), all `requireRole("agent")` + account-scoped, reading config + `decrypt(token)`:
  - `POST .../[id]/pre-accept` — send `pre_accept` with the agent's SDP answer (early media / faster connect).
  - `POST .../[id]/accept` — send `accept` (SDP answer) once WebRTC is connected.
  - `POST .../[id]/reject` — decline.
  - `POST .../[id]/terminate` — hang up.
  - Each updates the matching `call_logs` row (status, `answered_by_user_id`, timestamps).
- **Verify:** with a mocked `fetch`, unit-test each route posts the correct `action`/body and updates the row; manual curl against a live ringing call once Phase 0 done.

### Phase 3 — Browser softphone (WebRTC core)
- **New hook** `src/hooks/use-webrtc-call.ts`: wraps `RTCPeerConnection` (iceServers = Google STUN for now, read from a config constant so TURN slots in later), `getUserMedia({ audio: true })`, attaches remote audio to an `<audio autoplay>` element, tracks `connectionState`.
- **Inbound SDP handshake:** webhook delivers the customer's **SDP offer** (stored on the `call_logs` row / pushed via realtime). Flow: agent clicks Answer → `setRemoteDescription(offer)` → `createAnswer()` → `setLocalDescription` → POST answer to `.../accept` (optionally `.../pre-accept` first) → on `connected`, audio flows. Hang up → `.../terminate` + close peer connection.
- **Verify:** end-to-end on a real device once Phase 0/TURN allow — customer calls, agent answers in browser, two-way audio, hang up logs duration.

### Phase 4 — Inbox UI integration
- **Incoming-call alert:** app-level listener (extend `use-realtime.ts` with `onCallLogEvent`) → ringing `call_logs` INSERT shows an **Accept / Decline** toast/modal (reuse `sonner` + existing dialog primitives).
- **Active-call widget:** in `message-thread.tsx` header — contact name, live timer, **Mute / End**.
- **Call-log bubbles:** render completed/missed/declined calls inline in the thread via `message-bubble.tsx` (icon + duration + status), and surface call rows in the conversation timeline.
- **Permissions:** gate Answer/dial with `canSendMessages` (agent+), consistent with `roles.ts`.
- **Verify:** simulate a ringing `call_logs` row (realtime) → alert appears for agents; answering swaps to the active-call widget; ending renders a call bubble.

### Phase 5 — Calls history view + settings
- **Calls list:** a filterable view of `call_logs` (optionally a new nav entry or a tab in the inbox). Reuse existing list/table patterns.
- **Settings (optional):** small "Calling" section (toggle enable, future business-hours / call-icon visibility) following the `SETTINGS_SECTIONS` + `SECTION_META` pattern in `src/components/settings/settings-sections.ts`, gated `admin+`.
- **Verify:** history shows past calls with correct direction/duration; filters work.

### Phase 6 — Hardening before real use (tracked, not blocking dev)
- Add **TURN** (managed or coturn): make `iceServers` env-driven (`TURN_URL`/`TURN_USERNAME`/`TURN_CREDENTIAL`); STUN-only fails behind strict NAT.
- Concurrency/edge cases: missed-call timeout, agent already on a call, duplicate webhook events (idempotent on `meta_call_id`), token-refresh, error toasts.
- `npm run typecheck`, `npm run lint`, `npm run format`, `npm run test` clean.

---

## Key files
- New: `supabase/migrations/027_whatsapp_calling.sql`, `src/lib/whatsapp/call-events.ts`, `src/app/api/whatsapp/calls/[id]/{pre-accept,accept,reject,terminate}/route.ts`, `src/hooks/use-webrtc-call.ts`, incoming-call alert + active-call-widget components under `src/components/inbox/`.
- Modified: `src/app/api/whatsapp/webhook/route.ts` (calls branch + config-lookup refactor), `src/lib/whatsapp/meta-api.ts` (`manageCall`), `src/hooks/use-realtime.ts` (`onCallLogEvent`), `src/components/inbox/message-thread.tsx` + `message-bubble.tsx`, `src/components/settings/settings-sections.ts` (optional), `src/types` (CallLog + webhook call types).

## Important implementation note
The repo's `AGENTS.md` warns this **Next.js 16.2.6 has breaking changes vs. training data** — I will read the relevant guide under `node_modules/next/dist/docs/` before writing route handlers/components in each phase.

## Verification strategy
- **Per-phase unit tests** (vitest) for the webhook call-event reducer and the call-control routes (mocked `fetch`/Supabase).
- **Mocked-webhook integration**: replay recorded Meta `calls` payloads against `/api/whatsapp/webhook` with valid HMAC; assert `call_logs` transitions.
- **Live end-to-end** (after Phase 0 + real number + TURN): customer call → in-browser answer → two-way audio → hang-up → logged with duration.
- Gate each merge on `npm run typecheck && npm run lint && npm run test`.

## Branching
Work on a feature branch off `main` (e.g. `feat/whatsapp-calling`); commit per phase. Fork-local — no upstream PR.
