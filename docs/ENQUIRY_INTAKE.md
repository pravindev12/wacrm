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
Bot: What are you reaching out about?   [ Sales enquiry ] [ Job / Career ]

— Sales —                         — Jobs —
What's your name?                 What's your name?
Which company are you with?       Which role are you interested in?
What can we help you with?        How many years of experience?
Thanks — our team will reach out. Thanks — our HR team will get back.
→ tag: sales, assign: sales rep   → tag: jobs, assign: HR
```
The captured answers land in the **handoff note** on the conversation
(and in `flow_runs.vars`), so whoever picks it up sees the full lead.

## Setup (once, in the dashboard — ~3 min)
1. **Settings → Tags:** make sure a `sales` and a `jobs` tag exist.
2. **Flows → New → pick "New enquiry (Sales or Jobs)"** to clone it.
3. In the cloned flow, bind the two account-specific bits the template
   can't ship (they differ per instance):
   - the **`sales_tag`** node → your `sales` tag; **`jobs_tag`** → `jobs`
   - the **`sales_handoff`** → assign your **sales rep**;
     **`jobs_handoff`** → assign your **HR** person
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

## Where the lead lives (v1)
Tagged contact + the conversation + the handoff note + `flow_runs.vars`.
There's no separate "Leads" list yet — if you want a filterable leads
report with columns, that's a small follow-up (read `flow_runs.vars`
or write answers to contact custom fields).
