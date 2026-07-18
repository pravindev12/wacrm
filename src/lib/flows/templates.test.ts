import { describe, expect, it } from "vitest";
import {
  getFlowTemplate,
  listFlowTemplates,
  type FlowTemplate,
  type FlowTemplateNode,
} from "./templates";

/** Every node_key a given node points at (edges live inside config). */
function outgoingTargets(node: FlowTemplateNode): string[] {
  const c = node.config as Record<string, unknown>;
  switch (node.node_type) {
    case "start":
    case "send_message":
    case "collect_input":
    case "set_tag":
      return c.next_node_key ? [c.next_node_key as string] : [];
    case "send_buttons":
      return ((c.buttons as Array<{ next_node_key: string }>) ?? []).map(
        (b) => b.next_node_key,
      );
    case "send_list":
      return (
        (c.sections as Array<{ rows: Array<{ next_node_key: string }> }>) ?? []
      ).flatMap((s) => s.rows.map((r) => r.next_node_key));
    case "condition":
      return [c.true_next as string, c.false_next as string].filter(Boolean);
    case "handoff":
    case "end":
      return [];
    default:
      return [];
  }
}

/** node_keys reachable from the entry node, following config edges. */
function reachable(t: FlowTemplate): Set<string> {
  const byKey = new Map(t.nodes.map((n) => [n.node_key, n]));
  const seen = new Set<string>();
  const stack = [t.entry_node_id];
  while (stack.length) {
    const key = stack.pop()!;
    if (seen.has(key)) continue;
    seen.add(key);
    const node = byKey.get(key);
    if (node) stack.push(...outgoingTargets(node));
  }
  return seen;
}

describe("flow templates — registry integrity", () => {
  const templates = listFlowTemplates();

  it("every template's edges resolve to a defined node_key, and entry exists", () => {
    for (const t of templates) {
      const keys = new Set(t.nodes.map((n) => n.node_key));
      expect(keys, `${t.slug}: entry node exists`).toContain(t.entry_node_id);
      for (const node of t.nodes) {
        for (const target of outgoingTargets(node)) {
          expect(
            keys,
            `${t.slug}: node "${node.node_key}" → unknown "${target}"`,
          ).toContain(target);
        }
      }
    }
  });

  it("node_keys are unique within each template", () => {
    for (const t of templates) {
      const keys = t.nodes.map((n) => n.node_key);
      expect(new Set(keys).size, `${t.slug}: duplicate node_key`).toBe(
        keys.length,
      );
    }
  });
});

describe("enquiry_intake template (Sales / Jobs)", () => {
  const t = getFlowTemplate("enquiry_intake");

  it("is registered and triggers on first inbound message", () => {
    expect(t).not.toBeNull();
    expect(t!.trigger_type).toBe("first_inbound_message");
  });

  it("offers a Sales and a Jobs button off the menu", () => {
    const menu = t!.nodes.find((n) => n.node_type === "send_buttons");
    expect(menu, "has a send_buttons menu").toBeDefined();
    const replyIds = (
      (menu!.config as { buttons: Array<{ reply_id: string }> }).buttons
    ).map((b) => b.reply_id);
    expect(replyIds).toContain("sales");
    expect(replyIds).toContain("jobs");
  });

  it("each branch tags the contact and ends in a handoff (both reachable)", () => {
    const seen = reachable(t!);
    const seenNodes = t!.nodes.filter((n) => seen.has(n.node_key));
    const tags = seenNodes.filter((n) => n.node_type === "set_tag");
    const handoffs = seenNodes.filter((n) => n.node_type === "handoff");
    // one set_tag + one handoff per branch
    expect(tags.length).toBe(2);
    expect(handoffs.length).toBe(2);
    // both handoff notes carry the captured name for a readable lead record
    for (const h of handoffs) {
      expect((h.config as { note?: string }).note).toContain("{{vars.name}}");
    }
  });
});
