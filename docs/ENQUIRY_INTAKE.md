# New-enquiry intake bot (Sales vs Jobs)

A WhatsApp auto-intake flow that captures **every new chat** as a lead,
lets the customer self-sort into **Sales** or **Jobs**, collects the
right details, tags the contact, and hands off to the right team.

It's a wacrm **Flow** — no code to run. It ships as a one-click
template (`enquiry_intake`, "New enquiry (Sales or Jobs)") in
`src/lib/flows/templates.ts`.

## What the customer sees
```
(new contact sends their first message)
Bot: Welcome to JUSTTRY TECHNOLOGIES! 👋 …one quick question first.
Bot: What are you reaching out about?
     [ Sales enquiry ]  [ Job / Career ]  [ Something else ]

— Sales —              — Jobs —                    — Something else —
name                   name                        name
email                  email                       "how can we help?"
company                role interested in
what we can help with  years of experience
→ tag sales, → sales   → tag jobs, → HR            → (optional tag), → shared inbox
   rep                                                (unassigned — anyone picks it up)
```
The captured answers land in the **handoff note** on the conversation
(and in `flow_runs.vars`), so whoever picks it up sees the full lead.

## Setup (once, in the dashboard — ~3 min)
1. **Settings → Tags:** make sure a `sales` and a `jobs` tag exist.
2. **Flows → New → pick "New enquiry (Sales or Jobs)"** to clone it.
3. In the cloned flow, bind the account-specific bits the template
   can't ship (they differ per instance):
   - the **`sales_tag`** node → your `sales` tag; **`jobs_tag`** → `jobs`
   - the **`sales_handoff`** → assign your **sales rep**;
     **`jobs_handoff`** → assign your **HR** person
   - **"Something else" branch:** `other_handoff` is intentionally left
     **unassigned** (lands in the shared inbox). `other_tag` is optional —
     bind it to a `general` tag or **delete that node**.
4. (Optional) tweak the wording / add questions.
5. **Activate.**

> ⚠️ Only **one** active `first_inbound_message` flow should exist — the
> engine runs at most one flow per contact. If your existing
> `lead_capture` flow is still active, **archive it** first, or the two
> will contend for new chats.

## Already customised the flat `lead_capture` flow? Convert it instead
If you'd rather keep your existing (branded) flow and just add the split:
1. Open your flow. After the **intro** message, insert a **Send buttons**
   node: text "What are you reaching out about?", buttons
   `Sales enquiry` → your existing name question, and `Job / Career` → a
   new name question.
2. Duplicate your `name → … → handoff` chain to make a **Jobs** branch
   (ask role + experience instead of email + company).
3. Add a **Set tag** node before each handoff (`sales` / `jobs`).
4. Give each **Handoff** its own assignee (sales rep / HR).
5. Save → Activate.

## Where the lead lives
- **Contacts list** — the **name / email / company** answers are written
  straight onto the contact row (via each `collect_input`'s
  **"Also save to contact field"** setting), so they show as real columns
  on the Contacts page, not just inside the flow.
- Plus the tag, the conversation, the handoff note, and `flow_runs.vars`
  (which also holds the free-text answers like requirement / role / message).

### Note on the contact name
The webhook used to re-sync a contact's name to their WhatsApp display
name on **every** message, which overwrote a name captured in a flow.
That's fixed: the WhatsApp profile name now only fills the name while it's
still a placeholder (empty or equal to the phone). Once the flow (or an
agent) sets a real name, it sticks.

## Push leads to Odoo (crm.lead / hr.applicant)
Each handoff can classify the lead via **"Send to CRM as"** (sales / jobs /
other). When `ODOO_LEAD_WEBHOOK_URL` is set, reaching that handoff POSTs the
lead (contact + all answers + note) to that URL. The bridge in
`odoo-improvements/` (`wacrm_lead_bridge.py`) turns it into:
- `sales` / `other` → **crm.lead**
- `jobs` → **hr.applicant**

Setup: run the bridge (see `odoo-improvements/WACRM-LEAD-BRIDGE.md`), then
set `ODOO_LEAD_WEBHOOK_URL` (+ `ODOO_LEAD_WEBHOOK_SECRET`) in wacrm's env
and redeploy. The intake template already sets `lead_type` on all three
handoffs, so no flow edit is needed — just the env + bridge.

### Two ways to push (they coexist)
1. **Handoff shortcut** (above) — set "Send to CRM as" on a handoff; the
   URL/secret live in **env**. Simplest; used by the template.
2. **Webhook / HTTP node** — drop a general-purpose **Webhook** node
   anywhere in a flow (Add node → *Webhook / HTTP*). Configure the URL,
   method, an optional Authorization header, and a JSON **body** that
   interpolates `{{vars.x}}`. Fires the request then advances (best-effort).
   Use this for per-branch endpoints, other CRMs/Zapier/n8n, or when you
   want the URL in the flow rather than env. Example body:
   `{"lead_type":"sales","contact":{"name":"{{vars.name}}","email":"{{vars.email}}"},"answers":{"requirement":"{{vars.requirement}}"}}`

## Deferred
No dedicated in-app "Leads" report/list yet (filterable table). Captured
fields are on the contact + in `flow_runs.vars` + (optionally) Odoo — an
in-app Leads view is a small follow-up if you want columns/filters here too.
