import type { Message } from "@/types";

/**
 * Optimistic-message reconciliation for the inbox thread.
 *
 * Agent sends show up instantly as "optimistic" rows with a synthetic
 * `temp-<ts>` id and status `sending` (later `sent`/`failed`). The
 * authoritative row arrives separately — via a realtime INSERT or a
 * full refetch — carrying the real DB id.
 *
 * The bug this fixes: the old handlers dropped optimistic rows too
 * eagerly — a blanket "remove every temp-" on any INSERT, and a
 * wholesale `setMessages(loaded)` on every refetch. Both wiped
 * still-sending rows belonging to *other* sends and, worst, `failed`
 * rows (which have no real counterpart and must persist so the agent
 * sees the failure). Net effect: sent/failed messages "disappeared" on
 * refresh or when any other message arrived.
 *
 * `reconcileMessages` merges authoritative rows with optimistic ones,
 * removing an optimistic row ONLY when a matching real row exists
 * (matched one-to-one by content signature within a clock-skew window),
 * and keeping every unmatched optimistic row. Pure + deterministic so
 * it's unit-tested in isolation.
 */

/** True for a client-side optimistic row (synthetic temp id). */
export function isOptimistic(m: Message): boolean {
  return typeof m.id === "string" && m.id.startsWith("temp-");
}

// Allowed gap between an optimistic row's (client clock) created_at and
// its real row's (server clock) created_at when matching them. Generous
// enough to absorb client/server clock skew, tight enough that an older
// identical-text message from history can't be mistaken for the match.
const MATCH_SKEW_MS = 5 * 60 * 1000;

/**
 * Does real row `r` correspond to optimistic row `t`? Optimistic rows
 * are always agent-sent, so inbound customer rows never match. We
 * compare sender + content-type + text and require the real row's
 * timestamp to sit within the skew window around the optimistic one.
 */
function signaturesMatch(t: Message, r: Message): boolean {
  if (r.sender_type !== "agent" || t.sender_type !== "agent") return false;
  if (r.content_type !== t.content_type) return false;
  if ((r.content_text ?? "") !== (t.content_text ?? "")) return false;
  const dt = Date.parse(t.created_at);
  const dr = Date.parse(r.created_at);
  if (Number.isNaN(dt) || Number.isNaN(dr)) return true; // can't compare → trust the content match
  return Math.abs(dr - dt) <= MATCH_SKEW_MS;
}

function byCreatedAtAsc(a: Message, b: Message): number {
  return Date.parse(a.created_at) - Date.parse(b.created_at);
}

/**
 * Merge authoritative rows with optimistic ones.
 *
 * @param real       authoritative rows (from a DB fetch or realtime),
 *                   which may themselves include no optimistic rows.
 * @param optimistic the current optimistic (`temp-`) rows to reconcile.
 * @returns real rows plus every optimistic row that has NO matching real
 *          row, sorted by `created_at` ascending. Matching is one-to-one:
 *          two identical sends only drop two temps when two real rows
 *          have arrived.
 */
export function reconcileMessages(
  real: Message[],
  optimistic: Message[],
): Message[] {
  const matchedTempIds = new Set<string>();

  for (const r of real) {
    if (r.sender_type !== "agent") continue;
    const match = optimistic.find(
      (t) => !matchedTempIds.has(t.id) && signaturesMatch(t, r),
    );
    if (match) matchedTempIds.add(match.id);
  }

  const survivingOptimistic = optimistic.filter(
    (t) => !matchedTempIds.has(t.id),
  );

  return [...real, ...survivingOptimistic].sort(byCreatedAtAsc);
}
