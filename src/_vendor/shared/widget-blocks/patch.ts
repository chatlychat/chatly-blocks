/**
 * Mutating a block that is already on screen.
 *
 * Crossly's agent sends `reasons` after its option cards have rendered, and a
 * `status` block has to stop spinning. So a message's blocks are addressable
 * by `block.id` after the fact.
 *
 * Deliberate limits:
 *   - a patch targets an id WITHIN ONE MESSAGE. It cannot move blocks between
 *     messages, reorder them, or add new ones — those are new messages.
 *   - the id may name a top-level block OR a card nested in a `card_grid`.
 *     The grid is the motivating case: an agent sends three option cards and
 *     then names one of them. A resolver that scanned only the top level
 *     answered `unknown_id` for every card in every grid, which the route
 *     turned into a 404 on the feature's own worked example. Ids are unique
 *     within a message (the envelope schema enforces it), so "top level or
 *     nested" needs no tie-break.
 *   - `id` is refused in `set` for the same reason `type` is. Rewriting an id
 *     makes a block unaddressable by the id its author published, and pointed
 *     at a sibling it gives one envelope two blocks answering to one name —
 *     which every renderer then uses as a list key.
 *   - `set` is a shallow merge over that block's own fields, re-validated
 *     against that block type AFTER merging.
 *   - an unknown id is an error, never a no-op. A write that succeeds against
 *     nothing is the most repeated defect in this codebase.
 *   - if any merged result is invalid the WHOLE batch is refused: a
 *     half-applied patch leaves a shape no author ever wrote.
 */
import { z } from 'zod';

import { widgetBlocksEnvelopeSchema, type WidgetBlocksEnvelope } from './schema.js';

export const blockPatchSchema = z
  .object({
    id: z.string().min(1).max(64),
    // `type` is rejected in `applyBlockPatches` rather than here, so the
    // refusal reason is the same one an invalid merge produces.
    set: z.record(z.string(), z.unknown()),
  })
  .strict();

export type BlockPatch = z.infer<typeof blockPatchSchema>;

export type BlockPatchResult =
  | { readonly ok: true; readonly envelope: WidgetBlocksEnvelope }
  | { readonly ok: false; readonly reason: 'unknown_id' | 'invalid_result' };

export function applyBlockPatches(
  envelope: WidgetBlocksEnvelope,
  patches: readonly BlockPatch[],
): BlockPatchResult {
  /*
   * Work on plain copies, not on the caller's objects. A refusal must leave
   * the envelope it was given untouched, and the merged shape is deliberately
   * untyped until the schema has re-validated it — a spread over a
   * discriminated union is not a member of that union until something proves
   * it is.
   */
  const blocks: Array<Record<string, unknown>> = envelope.blocks.map((block) => {
    const copy: Record<string, unknown> = { ...block };
    // The grid's `cards` array is copied too, or a refusal later in the batch
    // would leave a card the caller handed us already merged.
    if (Array.isArray(copy['cards'])) {
      copy['cards'] = copy['cards'].map((card: unknown) =>
        typeof card === 'object' && card !== null ? { ...(card as Record<string, unknown>) } : card,
      );
    }
    return copy;
  });

  /** The object a patch's id names, or null. Top level first, then grid cards. */
  function resolve(id: string): Record<string, unknown> | null {
    const top = blocks.find((block) => block['id'] === id);
    if (top !== undefined) {
      return top;
    }
    for (const block of blocks) {
      /*
       * Narrowed to `unknown[]` before anything reads an element.
       * `Array.isArray` narrows to `any[]`, so `cards.find(...)` returns
       * `any` — and an `any` flowing out of a resolver whose whole job is to
       * hand back something a zod schema will then re-validate is the one
       * place that would not be caught later.
       */
      const cards: unknown = block['cards'];
      if (!Array.isArray(cards)) {
        continue;
      }
      const entries = cards as unknown[];
      const card = entries.find(
        (c) => typeof c === 'object' && c !== null && (c as Record<string, unknown>)['id'] === id,
      );
      if (card !== undefined) {
        return card as Record<string, unknown>;
      }
    }
    return null;
  }

  for (const patch of patches) {
    const target = resolve(patch.id);
    if (target === null) {
      return { ok: false, reason: 'unknown_id' };
    }
    if ('type' in patch.set || 'id' in patch.set) {
      return { ok: false, reason: 'invalid_result' };
    }
    Object.assign(target, patch.set);
  }

  // Re-validate the whole envelope: merging field-by-field can produce a shape
  // that each individual step looked fine for.
  const parsed = widgetBlocksEnvelopeSchema.safeParse({ v: envelope.v, blocks });
  return parsed.success
    ? { ok: true, envelope: parsed.data }
    : { ok: false, reason: 'invalid_result' };
}
