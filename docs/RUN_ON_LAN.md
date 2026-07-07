# Running wacrm on a local network machine — DevOps handoff

Everything needed to stand up this app on a LAN box for the team to test.
Hand this file to whoever sets up the machine.

---

## 1. What it is
- **Stack:** Next.js **16.2.x** + React 19 + TypeScript, Supabase (Postgres +
  Auth + Realtime + Storage) as the backend. Wraps the WhatsApp Business
  Cloud API.
- **Repo (fork):** `https://github.com/pravindev12/wacrm`
- **Branch to deploy:** `fix/messages-disappear-on-refresh`
  (contains the inbox bug fix we're testing). `main` is the clean base;
  `feat/whatsapp-calling` is a separate in-progress feature — **do not**
  deploy that one for this test.
- **Package manager:** npm (a `package-lock.json` is committed — use
  `npm ci`, not yarn/pnpm).

## 2. Machine prerequisites
- **Node.js ≥ 20** (we run 24 LTS). Install via nvm or the distro package.
- **git**, **npm**.
- Outbound HTTPS to `graph.facebook.com` (Meta API) and to the Supabase
  project URL.
- ~1 GB free disk for `node_modules` + `.next` build.
- (Prod-style run only) a process manager like **pm2** and optionally a
  reverse proxy (nginx/caddy) if you want a clean hostname instead of
  `:3000`.

## 3. Environment variables (`.env.local` in the repo root)
Copy `.env.local.example` → `.env.local` and fill these. **REQUIRED — the
app won't start without them:**

| Variable | Value / where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page → anon / public key |
| `SUPABASE_SERVICE_ROLE_KEY` | same page → service_role key (**secret**) |
| `ENCRYPTION_KEY` | **the exact same value the production deployment uses.** It decrypts the stored WhatsApp access token — a different key here makes sends fail. 64 hex chars. |
| `META_APP_SECRET` | same as production (Meta → App Settings → Basic). Verifies webhook signatures. |

**Recommended:**
- `NEXT_PUBLIC_SITE_URL` — e.g. `http://<lan-ip>:3000`

**Optional (only if used):** `AUTOMATION_CRON_SECRET`, `META_APP_ID`,
`WHATSAPP_TEMPLATES_DRY_RUN=true` (lets you exercise the template UI
without hitting Meta). See `.env.local.example` for the full annotated list.

> Since this test box points at the **same Supabase project as
> production**, `ENCRYPTION_KEY` and `META_APP_SECRET` **must match prod
> exactly** (grab them from the production host's env). No new secrets.

## 4. Database
- **Using the existing (production) Supabase project** → **no migrations to
  run.** Schema is already applied. Realtime is already enabled.
- Reference only: schema lives in `supabase/migrations/` (26 SQL files on
  this branch). If a *fresh* Supabase project were ever used instead, apply
  them in order via the Supabase CLI (`supabase db push`) or paste each into
  the SQL editor — but that's **not** what we're doing here.

## 5. Install & run

**Quick test (dev server):**
```bash
git clone https://github.com/pravindev12/wacrm.git
cd wacrm
git checkout fix/messages-disappear-on-refresh
npm ci
cp .env.local.example .env.local     # then fill in the values from §3
# bind to all interfaces so other machines on the LAN can reach it:
npm run dev -- --hostname 0.0.0.0 --port 3000
```

**Production-style run (faster, what a shared test box should use):**
```bash
npm ci
# .env.local filled in
npm run build
npm run start -- --hostname 0.0.0.0 --port 3000
# (optional) keep it alive: pm2 start "npm run start -- -H 0.0.0.0 -p 3000" --name wacrm
```

- App serves on **port 3000**. Open the firewall for it on the LAN.
- Team reaches it at **`http://<machine-LAN-IP>:3000`** (e.g.
  `http://192.168.1.50:3000`). Log in with existing wacrm accounts.

## 6. Networking / webhooks — important
- **Inbound messages still work** on the LAN box without exposing it to the
  internet. Meta delivers webhooks to the public production URL
  (`funcky.xyz`); production writes them into the shared Supabase; the LAN
  app receives them **live via Supabase Realtime**. So realtime inbound is
  fully testable.
- **Do NOT repoint the Meta webhook** at this machine — a LAN box isn't
  publicly reachable, and changing the webhook URL would break production
  inbound. Leave the webhook on `funcky.xyz`.
- Only outbound HTTPS is needed from the box; no inbound ports need to be
  open to the internet (just the LAN port 3000).

## 7. ⚠️ Cautions (shared prod backend)
- This instance uses the **same database and the same WhatsApp number as
  production.** Actions here are **real**:
  - **Sending a message from this box sends a real WhatsApp message** via
    the live Meta API. Test by messaging your own number.
  - Writes (status changes, assignments, notes) **affect production data.**
- Treat it as a live console on prod, not an isolated sandbox. If true
  isolation is needed, use a separate Supabase project + a Meta test number
  (more setup — ask and we'll document it).

## 8. Sanity checks before handing to the team
```bash
npm run typecheck   # tsc, must be clean
npm run lint        # 0 errors (some pre-existing warnings are fine)
npm run test        # vitest, all pass
npm run build       # must succeed
```

## 9. What we're testing on this box
The **"messages disappear on refresh"** fix. To verify:
1. Open a conversation, send a message to your own number → it stays.
2. Force a failure (send to a non-whitelisted number, or briefly go
   offline) → the **failed** message should stay visible (previously it
   vanished).
3. Hit the thread's refresh button / switch browser tabs and back →
   messages persist.
```
