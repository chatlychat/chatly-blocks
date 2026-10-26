/**
 * The id a block action is known by, when its author did not give it one.
 *
 * ── Why this is a module of its own with NO dependencies ────────────────
 *
 * `Chatly('reportAction', …)` reports a result against an `actionId`, and the
 * widget is what tells the host page what that id is. The widget's bundle may
 * not import anything that pulls zod — `href-guard.ts` records the measured
 * cost of getting that wrong, 15KB gzipped against a 44,000-byte first-paint
 * budget — and `actions.ts`, where this belongs conceptually, is the zod
 * schema.
 *
 * So it lives here, importable by anything, and `actions.ts` re-exports it so
 * there is still only one name to find.
 *
 * ── Why a POSITIONAL fallback at all ───────────────────────────────────
 *
 * Making `id` required on an action would have broken every card written
 * before results existed. Emitting `null` instead would have handed
 * integrators a field that is usually absent and silently unusable, which is
 * worse: the first thing they do with it is pass it back.
 *
 * The cost, stated: a positional id is stable for as long as the envelope is,
 * which is the whole life of the click it describes — but a block PATCH that
 * reorders or inserts blocks moves it. An author who wants an id that
 * survives that sets `id` on the action, and the docs say so.
 */

/**
 * `b2.c3.a0` — block 2, card 3, action 0. `b2.a1` outside a grid.
 *
 * Shaped so it can never be confused with an author-supplied id by accident:
 * `.` is legal in the action-id charset, so a literal `b0.a1` as a
 * hand-written id is possible, but only on purpose.
 */
export function positionalActionId(input: {
  blockIndex: number;
  cardIndex?: number;
  actionIndex: number;
}): string {
  const card = input.cardIndex === undefined ? '' : `c${String(input.cardIndex)}.`;
  return `b${String(input.blockIndex)}.${card}a${String(input.actionIndex)}`;
}
