import { describe, expect, it } from "vitest";
import { isOptimistic, reconcileMessages } from "./reconcile-messages";
import type { Message } from "@/types";

const BASE_TS = Date.parse("2026-06-26T10:00:00.000Z");

function msg(over: Partial<Message>): Message {
  return {
    id: "m1",
    conversation_id: "c1",
    sender_type: "agent",
    content_type: "text",
    content_text: "hello",
    status: "sent",
    created_at: new Date(BASE_TS).toISOString(),
    ...over,
  };
}

describe("isOptimistic", () => {
  it("is true only for temp- ids", () => {
    expect(isOptimistic(msg({ id: "temp-123" }))).toBe(true);
    expect(isOptimistic(msg({ id: "real-uuid" }))).toBe(false);
  });
});

describe("reconcileMessages", () => {
  it("drops an optimistic row once its matching real row arrives", () => {
    const temp = msg({ id: "temp-1", status: "sent", content_text: "hi" });
    const real = msg({ id: "r1", content_text: "hi" });
    const out = reconcileMessages([real], [temp]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("r1");
  });

  it("KEEPS a failed optimistic row (no real counterpart) — the core bug", () => {
    const failed = msg({ id: "temp-1", status: "failed", content_text: "oops" });
    // A full refetch returns only the real rows; failed send is not among them.
    const realHistory = [msg({ id: "r0", content_text: "earlier" })];
    const out = reconcileMessages(realHistory, [failed]);
    expect(out.map((m) => m.id)).toContain("temp-1");
    expect(out).toHaveLength(2);
  });

  it("keeps an in-flight optimistic row belonging to a DIFFERENT send when another message arrives", () => {
    const inFlight = msg({
      id: "temp-2",
      status: "sending",
      content_text: "second",
      created_at: new Date(BASE_TS + 1000).toISOString(),
    });
    // An inbound customer message arrives.
    const inbound = msg({
      id: "r-in",
      sender_type: "customer",
      content_text: "customer says hi",
    });
    const out = reconcileMessages([inbound], [inFlight]);
    expect(out.map((m) => m.id)).toEqual(["r-in", "temp-2"]);
  });

  it("never matches an optimistic row to an inbound (customer) row", () => {
    const temp = msg({ id: "temp-1", content_text: "hi" });
    const inbound = msg({ id: "r-in", sender_type: "customer", content_text: "hi" });
    const out = reconcileMessages([inbound], [temp]);
    // temp survives — customer row is not its real counterpart
    expect(out.map((m) => m.id).sort()).toEqual(["r-in", "temp-1"]);
  });

  it("matches two identical sends one-to-one (only drops as many temps as real rows exist)", () => {
    const t1 = msg({ id: "temp-1", content_text: "ok", created_at: new Date(BASE_TS).toISOString() });
    const t2 = msg({ id: "temp-2", content_text: "ok", created_at: new Date(BASE_TS + 500).toISOString() });
    // Only the first real row has arrived so far.
    const r1 = msg({ id: "r1", content_text: "ok", created_at: new Date(BASE_TS + 100).toISOString() });
    const out = reconcileMessages([r1], [t1, t2]);
    expect(out).toHaveLength(2);
    expect(out.map((m) => m.id)).toContain("r1");
    // exactly one temp survives
    const temps = out.filter((m) => isOptimistic(m));
    expect(temps).toHaveLength(1);
  });

  it("does NOT match an old identical-text history row to a fresh optimistic row (skew window)", () => {
    const freshTemp = msg({
      id: "temp-1",
      content_text: "hi",
      created_at: new Date(BASE_TS).toISOString(),
    });
    // An identical-text message from an hour earlier.
    const oldReal = msg({
      id: "r-old",
      content_text: "hi",
      created_at: new Date(BASE_TS - 60 * 60 * 1000).toISOString(),
    });
    const out = reconcileMessages([oldReal], [freshTemp]);
    // temp must survive — the old row is not its counterpart
    expect(out.map((m) => m.id).sort()).toEqual(["r-old", "temp-1"]);
  });

  it("returns messages sorted by created_at ascending", () => {
    const a = msg({ id: "r-a", created_at: new Date(BASE_TS + 2000).toISOString() });
    const b = msg({ id: "r-b", created_at: new Date(BASE_TS).toISOString() });
    const t = msg({
      id: "temp-x",
      content_text: "pending",
      status: "sending",
      created_at: new Date(BASE_TS + 5000).toISOString(),
    });
    const out = reconcileMessages([a, b], [t]);
    expect(out.map((m) => m.id)).toEqual(["r-b", "r-a", "temp-x"]);
  });
});
