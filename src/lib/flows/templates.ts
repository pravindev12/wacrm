/**
 * Starter flow templates.
 *
 * Three pre-canned flows users can clone with one click instead of
 * building from scratch. Each template is a plain JS object describing
 * the same shape `/api/flows` PUT accepts — name, trigger config,
 * entry_node_id, fallback_policy, nodes[] — keyed by a stable
 * `slug`.
 *
 * The clone path (`/api/flows` POST with `template_slug`) creates a
 * NEW flow_row + flow_nodes rows for the user. `node_key`s are kept
 * verbatim (they're stable strings, not UUIDs, so cloning never
 * needs to rewrite edge references).
 *
 * Choosing a single static module over a DB-backed gallery for v1
 * because: (a) the set is small and changes with code releases, not
 * data; (b) keeps templates portable across self-hosted instances
 * without migrations; (c) editing in source is the lowest-friction
 * way to add the next template.
 */

import type {
  CollectInputNodeConfig,
  ConditionNodeConfig,
  HandoffNodeConfig,
  KeywordTriggerConfig,
  SendButtonsNodeConfig,
  SendListNodeConfig,
  SendMessageNodeConfig,
  SetTagNodeConfig,
  StartNodeConfig,
} from "./types";

export type FlowTemplateNodeType =
  | "start"
  | "send_message"
  | "send_buttons"
  | "send_list"
  | "collect_input"
  | "condition"
  | "set_tag"
  | "handoff"
  | "end";

export interface FlowTemplateNode {
  node_key: string;
  node_type: FlowTemplateNodeType;
  config:
    | StartNodeConfig
    | SendMessageNodeConfig
    | SendButtonsNodeConfig
    | SendListNodeConfig
    | CollectInputNodeConfig
    | ConditionNodeConfig
    | HandoffNodeConfig
    | Record<string, unknown>;
}

export interface FlowTemplate {
  slug: string;
  name: string;
  description: string;
  /** Used by the gallery to surface a relevant icon. lucide-react name. */
  icon: "MessageSquare" | "HelpCircle" | "UserPlus";
  trigger_type: "keyword" | "first_inbound_message" | "manual";
  trigger_config: KeywordTriggerConfig | Record<string, unknown>;
  entry_node_id: string;
  nodes: FlowTemplateNode[];
}

// ============================================================
// 1. Welcome menu — the example from the owner's brief
// ============================================================
const WELCOME_MENU: FlowTemplate = {
  slug: "welcome_menu",
  name: "Welcome menu",
  description:
    "Greet customers who type a keyword and route them to the right agent based on whether they're new or existing.",
  icon: "MessageSquare",
  trigger_type: "keyword",
  trigger_config: { keywords: ["support", "help", "hi"], match_type: "contains" },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "welcome" },
    },
    {
      node_key: "welcome",
      node_type: "send_buttons",
      config: {
        text: "Hi! 👋 Welcome to support. Are you an existing customer or new here?",
        footer_text: "Tap a button below to continue.",
        buttons: [
          {
            reply_id: "existing",
            title: "Existing customer",
            next_node_key: "existing_handoff",
          },
          {
            reply_id: "new",
            title: "New customer",
            next_node_key: "new_handoff",
          },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "existing_handoff",
      node_type: "handoff",
      config: {
        note: "Existing customer needs assistance — please check account history before replying.",
      } as HandoffNodeConfig,
    },
    {
      node_key: "new_handoff",
      node_type: "handoff",
      config: {
        note: "New customer — share pricing + onboarding link.",
      } as HandoffNodeConfig,
    },
  ],
};

// ============================================================
// 2. FAQ bot — list-message answers, fully automated
// ============================================================
const FAQ_BOT: FlowTemplate = {
  slug: "faq_bot",
  name: "FAQ bot",
  description:
    "Answer common questions automatically. Customer picks a topic from a list; the bot replies with the answer and ends.",
  icon: "HelpCircle",
  trigger_type: "keyword",
  trigger_config: {
    keywords: ["faq", "question", "info"],
    match_type: "contains",
  },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "topics" },
    },
    {
      node_key: "topics",
      node_type: "send_list",
      config: {
        text: "What can I help you with?",
        button_label: "View topics",
        sections: [
          {
            title: "Common questions",
            rows: [
              {
                reply_id: "hours",
                title: "Opening hours",
                next_node_key: "answer_hours",
              },
              {
                reply_id: "pricing",
                title: "Pricing",
                next_node_key: "answer_pricing",
              },
              {
                reply_id: "refunds",
                title: "Refund policy",
                next_node_key: "answer_refunds",
              },
            ],
          },
          {
            title: "Other",
            rows: [
              {
                reply_id: "human",
                title: "Talk to a human",
                next_node_key: "human_handoff",
              },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    {
      node_key: "answer_hours",
      node_type: "send_message",
      config: {
        text: "We're open Mon–Fri, 9am–6pm local time. Weekend support is limited to urgent issues.",
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "answer_pricing",
      node_type: "send_message",
      config: {
        text: "Our pricing starts at $9/mo. Visit https://example.com/pricing for the full breakdown.",
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "answer_refunds",
      node_type: "send_message",
      config: {
        text: "Refunds are honored within 30 days of purchase. Reply with your order number and we'll process it.",
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "human_handoff",
      node_type: "handoff",
      config: {
        note: "Customer asked to talk to a human from the FAQ bot.",
      } as HandoffNodeConfig,
    },
    {
      node_key: "end",
      node_type: "end",
      config: {},
    },
  ],
};

// ============================================================
// 3. Lead capture — collect_input chain, ends in a handoff
// ============================================================
const LEAD_CAPTURE: FlowTemplate = {
  slug: "lead_capture",
  name: "Lead capture",
  description:
    "Greet first-time inbounds, capture name + email + company, then hand off to sales with the answers in the note.",
  icon: "UserPlus",
  trigger_type: "first_inbound_message",
  trigger_config: {},
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "intro" },
    },
    {
      node_key: "intro",
      node_type: "send_message",
      config: {
        text: "Welcome! 👋 I'll ask a few quick questions so we can get you to the right person.",
        next_node_key: "ask_name",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "ask_name",
      node_type: "collect_input",
      config: {
        prompt_text: "What's your name?",
        var_key: "name",
        next_node_key: "ask_email",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_email",
      node_type: "collect_input",
      config: {
        prompt_text: "Thanks {{vars.name}}! What's your work email?",
        var_key: "email",
        next_node_key: "ask_company",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_company",
      node_type: "collect_input",
      config: {
        prompt_text: "Almost done — what's your company name?",
        var_key: "company",
        next_node_key: "handoff",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "handoff",
      node_type: "handoff",
      config: {
        note: "New lead — name={{vars.name}}, email={{vars.email}}, company={{vars.company}}.",
      } as HandoffNodeConfig,
    },
  ],
};

// ============================================================
// 4. New enquiry (Sales or Jobs) — buttons split → per-branch
//    collect_input → set_tag → handoff to the right team.
//
// Built for a single WhatsApp number that fields BOTH sales leads and
// job enquiries. Fires on the contact's first message (so we're inside
// the 24h window and can send the interactive menu freely), asks the
// customer which it is, captures the branch's fields, tags the contact,
// and hands off to sales / HR with the answers in the note.
//
// After cloning, the operator binds the two account-specific ids the
// builder can't ship (they vary per instance):
//   - set_tag → pick the `sales` / `jobs` tag
//   - handoff → assign the sales rep / HR teammate
// ...then activates. See docs/ENQUIRY_INTAKE.md.
// ============================================================
const ENQUIRY_INTAKE: FlowTemplate = {
  slug: "enquiry_intake",
  name: "New enquiry (Sales or Jobs)",
  description:
    "Greet every new chat, ask if it's a sales or job enquiry, capture the right details for each, tag the contact, and hand off to the right team.",
  icon: "UserPlus",
  trigger_type: "first_inbound_message",
  trigger_config: {},
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "intro" },
    },
    {
      node_key: "intro",
      node_type: "send_message",
      config: {
        text: "Welcome to JUSTTRY TECHNOLOGIES! 👋 So we can help you faster, just one quick question first.",
        next_node_key: "menu",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "menu",
      node_type: "send_buttons",
      config: {
        text: "What are you reaching out about?",
        buttons: [
          {
            reply_id: "sales",
            title: "Sales enquiry",
            next_node_key: "sales_name",
          },
          {
            reply_id: "jobs",
            title: "Job / Career",
            next_node_key: "jobs_name",
          },
        ],
      } as SendButtonsNodeConfig,
    },

    // ---- Sales branch ------------------------------------------------
    {
      node_key: "sales_name",
      node_type: "collect_input",
      config: {
        prompt_text: "Great! What's your name?",
        var_key: "name",
        next_node_key: "sales_company",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "sales_company",
      node_type: "collect_input",
      config: {
        prompt_text: "Thanks {{vars.name}}! Which company are you with?",
        var_key: "company",
        next_node_key: "sales_need",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "sales_need",
      node_type: "collect_input",
      config: {
        prompt_text:
          "And briefly, what can we help you with? (project / service you're after)",
        var_key: "requirement",
        next_node_key: "sales_thanks",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "sales_thanks",
      node_type: "send_message",
      config: {
        text: "Thanks {{vars.name}} — our team will reach out shortly. 🙌",
        next_node_key: "sales_tag",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "sales_tag",
      node_type: "set_tag",
      // tag_id is bound after cloning (pick the `sales` tag in the builder).
      config: { mode: "add", tag_id: "", next_node_key: "sales_handoff" } as SetTagNodeConfig,
    },
    {
      node_key: "sales_handoff",
      node_type: "handoff",
      // assign_to is bound after cloning (assign to the sales rep).
      config: {
        note: "SALES lead — name={{vars.name}}, company={{vars.company}}, need={{vars.requirement}}",
      } as HandoffNodeConfig,
    },

    // ---- Jobs branch -------------------------------------------------
    {
      node_key: "jobs_name",
      node_type: "collect_input",
      config: {
        prompt_text: "Great! What's your name?",
        var_key: "name",
        next_node_key: "jobs_role",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "jobs_role",
      node_type: "collect_input",
      config: {
        prompt_text: "Thanks {{vars.name}}! Which role are you interested in?",
        var_key: "position",
        next_node_key: "jobs_exp",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "jobs_exp",
      node_type: "collect_input",
      config: {
        prompt_text: "How many years of experience do you have?",
        var_key: "experience",
        next_node_key: "jobs_thanks",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "jobs_thanks",
      node_type: "send_message",
      config: {
        text: "Thanks {{vars.name}} — our HR team will get back to you. 🙌",
        next_node_key: "jobs_tag",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "jobs_tag",
      node_type: "set_tag",
      // tag_id is bound after cloning (pick the `jobs` tag in the builder).
      config: { mode: "add", tag_id: "", next_node_key: "jobs_handoff" } as SetTagNodeConfig,
    },
    {
      node_key: "jobs_handoff",
      node_type: "handoff",
      // assign_to is bound after cloning (assign to the HR teammate).
      config: {
        note: "JOB enquiry — name={{vars.name}}, position={{vars.position}}, exp={{vars.experience}}",
      } as HandoffNodeConfig,
    },
  ],
};

// ============================================================
// Registry
// ============================================================

const TEMPLATES: Record<string, FlowTemplate> = {
  welcome_menu: WELCOME_MENU,
  faq_bot: FAQ_BOT,
  lead_capture: LEAD_CAPTURE,
  enquiry_intake: ENQUIRY_INTAKE,
};

export function getFlowTemplate(slug: string): FlowTemplate | null {
  return TEMPLATES[slug] ?? null;
}

export function listFlowTemplates(): FlowTemplate[] {
  return Object.values(TEMPLATES);
}
