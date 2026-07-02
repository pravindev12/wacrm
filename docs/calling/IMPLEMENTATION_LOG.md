# WhatsApp Calling — Implementation Log

> Fork-local feature (not upstream). Branch: `feat/whatsapp-calling`.
> Built 2026-06-24. This log is the human-readable record of what was
> built, why, how it was verified, and what remains. Commit hashes are
> on the feature branch.

## Goal
Add a calling feature like other WhatsApp CRMs: agents take **inbound
voice calls** from customers **inside wacrm** (browser softphone), with
a **call history**. Built on Meta's **WhatsApp Business Calling API**
(VoIP over WebRTC, 2025), which works on Cloud API numbers.

## Scope decisions (agreed with user)
- **Inbound first.** Outbound/business-initiated is deferred — it needs
  Meta's 2,000 business-initiated-conversation tier + a granted Call
  Permission Request, which a new number can't meet yet.
- **Browser softphone (WebRTC).** Agents talk in the browser via
  `getUserMedia` + `RTCPeerConnection`. No SIP/PBX.
- **STUN-only for dev.** TURN relay added before real team use.

## Call flow (end state)
Customer calls the WhatsApp number → Meta POSTs the `calls` webhook →
a `call_logs` row goes `ringing` → Supabase realtime pops an
Answer/Decline card (any screen) → agent answers → browser does the
SDP offer/answer handshake → two-way WebRTC audio → hang up →
`call_logs` row closed with duration → visible in `/calls`.

---

## Phases & commits

| # | Commit | What |
|---|--------|------|
| 1 | `a048cfb` | DB + webhook ingestion |
| 2 | `5271164` | Meta call-control helper + API route |
| 3 | `b8768d2` | Browser softphone WebRTC hook + ICE config |
| 4 | `6b7e739` | Global CallCenter (incoming alert + active widget) |
| 5 | `50bca98` | Calls history page + sidebar nav |
| 6 | `2a00849` | TURN env docs + final verification |

### Phase 1 — Data model + webhook ingestion
- `supabase/migrations/027_whatsapp_calling.sql` — `call_logs` table,
  modelled as a **child of `conversations`** (RLS via join to the
  parent + `is_account_member`, mirroring `messages`). `account_id`
  denormalised for fast list queries + realtime filtering. Stores the
  customer's `offer_sdp` for the softphone. Unique `(account_id,
  meta_call_id)` so duplicate webhook deliveries upsert one row.
  Statuses: `initiated|ringing|connected|completed|missed|declined|failed`.
- `src/lib/whatsapp/call-events.ts` — **pure** `reduceCallEvent(event,
  existing, nowIso)` maps a Meta call event → row patch (connect →
  ringing + capture SDP; terminate → completed/missed/declined/failed
  with duration). No I/O → unit-tested (`call-events.test.ts`, 10 tests).
- `src/app/api/whatsapp/webhook/route.ts` — added a `value.calls`
  branch; refactored config-lookup into `resolveAccountConfig()` so it
  runs for calls **or** messages; `handleCallEvent()` resolves/creates
  the contact + conversation (reusing the message helpers) and upserts.

### Phase 2 — Meta call-control
- `src/lib/whatsapp/meta-api.ts` — `manageCall({ phoneNumberId,
  accessToken, callId, action, sdp? })` → `POST /{phoneNumberId}/calls`
  with `action` ∈ `pre_accept | accept | reject | terminate`; attaches
  the agent's SDP answer for the accept actions. (`meta-api.calls.test.ts`, 5 tests.)
- `src/app/api/whatsapp/calls/[id]/route.ts` — `POST` keyed on our
  internal `call_logs.id` (UUID, never Meta's id). `requireRole('agent')`
  + account-scoped. Relays the action to Meta with the decrypted token,
  then advances the row (accept→connected, reject→declined,
  terminate→completed|missed with duration).

### Phase 3 — Browser softphone
- `src/hooks/use-webrtc-call.ts` — `useWebrtcCall()`: on answer,
  `getUserMedia(audio)` → `RTCPeerConnection` → `setRemoteDescription`
  (offer) → `createAnswer` → **wait for ICE gathering** (non-trickle) →
  POST the answer to the accept route. Exposes `phase`, `muted`,
  `answer()`, `hangup()`, `toggleMute()`, `remoteAudioRef`.
- `src/lib/whatsapp/webrtc-config.ts` — `getIceServers()`: Google STUN
  now; env-driven TURN (`NEXT_PUBLIC_TURN_*`) slots in with no code change.

### Phase 4 — Global call surface
- `src/components/calling/call-center.tsx` — mounted once in
  `dashboard-shell.tsx`. Subscribes to `call_logs` realtime (RLS-scoped),
  pops an Answer/Decline card on a ringing inbound call, drives the
  softphone, shows a live active-call widget (mute/end + timer), tears
  down when the caller ends remotely. Headless when idle.
- `src/types/index.ts` — `CallLog`, `CallStatus`, `CallDirection`.

### Phase 5 — History
- `src/app/(dashboard)/calls/page.tsx` — `/calls` lists `call_logs`
  (RLS-scoped, contact join, direction/status/duration/relative-time),
  live-refreshing via realtime, click-through to the conversation.
- `src/components/layout/sidebar.tsx` — "Calls" nav entry (Phone icon).

### Phase 6 — Hardening
- `.env.local.example` — documented `NEXT_PUBLIC_TURN_*`.

---

## Verification (as of build)
- `npx tsc --noEmit` — clean.
- `npx vitest run` — **478 passed** (38 files), incl. 15 new calling tests.
- `npm run lint` — **0 errors** (only pre-existing warnings).
- `npm run build` — success; `/calls` and `/api/whatsapp/calls/[id]` compiled.

## Remaining before it can ring live (Phase 0 — Meta-side, manual)
1. **Apply migration `027`** to the Supabase project.
2. **Move off the TEST number** to the real migrated number; app in **Live** mode.
3. In the Meta app: **subscribe to the `calls` webhook field** and **enable Calling** on the number.
4. **Add a TURN server** (`NEXT_PUBLIC_TURN_*`) — STUN-only fails on most office/mobile networks.
5. Merge `feat/whatsapp-calling` → fork `main` and deploy.
6. Live end-to-end test: real inbound call → answer in browser → two-way audio → hang up → logged.

## Deferred (future phases)
- Outbound / business-initiated calls (needs the 2,000-conv tier + Call Permission Request).
- Per-conversation inline call bubbles in the chat thread.
- A calling settings tab (business hours, call-icon visibility).

## Notes / caveats
- Meta iterated on the exact `calls` webhook field shape during rollout;
  `call-events.ts` reads fields defensively — **re-verify against a live
  payload** before trusting any single field.
- Realtime relies on Supabase RLS gating `postgres_changes` — agents
  only receive their own account's call rows.
- This Next.js (16.2.6) has breaking changes vs. common patterns (see
  `AGENTS.md`); route handlers use async `params: Promise<{…}>`.
