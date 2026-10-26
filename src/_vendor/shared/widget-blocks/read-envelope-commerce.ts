/**
 * The commerce half of the block reader — `card.variants`, `card.stock`,
 * `card_grid.more` and `order_status.steps`, and nothing else.
 *
 * ── Why this is a FILE and not a section ───────────────────────────────
 *
 * It already had to be a separate EXPORT, and the long note at the top of
 * `read-envelope.ts` says why: those four fields cost 297 gzipped bytes of
 * `widget.js`, which every visitor on every customer page downloads whether
 * or not they ever open the chat. The widget takes `readBlocksEnvelopeBase`
 * at first paint and gets this pass from `widget-commerce.js`, the chunk it
 * already fetches when a commerce block arrives.
 *
 * Splitting the export out of the module is a smaller step than it looks and
 * was taken for the dullest of reasons — `read-envelope.ts` was at 648 lines
 * against a 650-line ceiling. It was MEASURED before and after rather than
 * argued: first paint and all six artifacts came out byte-identical, because
 * rollup was already dropping this code at the export boundary and a module
 * boundary is the same cut in a more obvious place.
 *
 * ── The rule for editing this file ─────────────────────────────────────
 *
 * It may import from `read-primitives.ts` and from the leaves. It may NOT
 * import from `read-envelope.ts`, and `read-envelope.ts` may not reference
 * anything declared here except through the composition at its foot. One edge
 * in either direction and the tree-shake stops, those 297 bytes come back,
 * and `node scripts/check-bundle-size.mjs` fails on the same commit — which
 * remains the only mechanism enforcing any of this, deliberately: a
 * measurement is a better guard than an assertion about a bundler.
 *
 * `extendCommerceBlocks` is still re-exported from `read-envelope.ts`, so no
 * importer anywhere — including the widget's `commerce-chunk.ts`, which takes
 * it from the `widget-blocks/read-envelope` subpath — had to change.
 */
import { isBag, readAction, str, type Bag } from './read-primitives.js';

import type { WidgetBlock, WidgetBlocksEnvelope } from './schema.js';

/** The three `card.stock` states, so an unrecognised one never reaches a class name. */
const isStock = (v: unknown): boolean => v === 'in_stock' || v === 'low' || v === 'out_of_stock';

/** The three `order_status` step states. An unrecognised one is coerced, not dropped. */
const isStepState = (v: unknown): boolean => v === 'done' || v === 'current' || v === 'pending';

/**
 * Variants, keeping unknown keys and normalising the one a renderer branches on.
 *
 * A variant needs both halves for the same reason a quick reply does: `label`
 * is what the shopper reads in the select and `value` is what gets sent, and
 * an option missing either is unreadable or unanswerable. One bad option
 * loses that option, not the card.
 *
 * `inStock` is forced to absent-or-boolean. A renderer greys out `false` and
 * leaves absent alone, and the string `"false"` passed through would be
 * neither — truthy to `!variant.inStock` and not equal to `false`, so two
 * renderers written the two obvious ways would disagree about whether the
 * option can be bought.
 */
function readVariants(raw: unknown): Bag[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: Bag[] = [];
  for (const entry of raw) {
    if (!isBag(entry) || !str(entry['label']) || !str(entry['value'])) {
      continue;
    }
    const variant: Bag = { ...entry };
    if (typeof variant['inStock'] !== 'boolean') {
      delete variant['inStock'];
    }
    out.push(variant);
  }
  return out;
}

/**
 * A grid's trailing "more" tile, or null.
 *
 * Narrowed to the two action kinds that can page, matching the write schema:
 * a `copy`, `host_event` or `step` tile would render as a button that shows no
 * more cards. Dropping the tile keeps the grid — twenty-four cards are the
 * substance and a missing affordance for the twenty-fifth is not worth losing
 * them.
 */
function readGridMore(raw: unknown): Bag | null {
  if (!isBag(raw) || !str(raw['label'])) {
    return null;
  }
  const action = readAction(raw['action']);
  if (action === null || (action.kind !== 'postback' && action.kind !== 'url')) {
    return null;
  }
  return { ...raw, action };
}

/**
 * Timeline steps, with the state COERCED rather than the step dropped.
 *
 * `state` reaches a class name, so it cannot pass through unrecognised — the
 * `layout` rule. But the two ways of enforcing that are not equally safe
 * here. Dropping a step whose state a later release invented (`failed`, say)
 * removes a ROW from a timeline, and a timeline missing a row reads as an
 * order that skipped a stage: the words "Payment failed" vanish and the
 * shopper is told nothing. Coercing to `pending` keeps the label and the
 * timestamp, which is what a person actually reads, and costs only the shape
 * of a dot. So this normalises, for the reason `readCard` normalises a price:
 * no renderer should ever see a value outside the three it draws.
 *
 * `at` is dropped unless it parses. A string a date formatter cannot read
 * renders as the words "Invalid Date" next to a fulfilment milestone, which
 * is worse than no date at all — and `at` is optional precisely because a
 * pending step has none.
 */
function readTimelineSteps(raw: unknown): Bag[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: Bag[] = [];
  for (const entry of raw) {
    if (!isBag(entry) || !str(entry['label'])) {
      continue;
    }
    const step: Bag = { ...entry };
    if (!isStepState(step['state'])) {
      step['state'] = 'pending';
    }
    if (step['at'] !== undefined && !(str(step['at']) && !Number.isNaN(Date.parse(step['at'])))) {
      delete step['at'];
    }
    out.push(step);
  }
  return out;
}

/**
 * `variants` and `stock` on a card the base reader already built.
 *
 * In PLACE, and that is what makes the composition byte-identical to the one
 * reader this used to be: `readCard` returns `{ ...raw, actions, fields }`, so
 * a `variants` key that was present in `raw` keeps its position in the object
 * when this assigns over it. A function that rebuilt the card would move the
 * key to the end and `JSON.stringify` of the two readers would differ — which
 * is exactly what `read-envelope.parity.spec.ts` now compares.
 *
 * Both keys are touched ONLY when present. Not a style choice: `readCard`
 * sets `actions` and `fields` unconditionally, so every card carries two
 * empty arrays, and a THIRD unconditional key would make every existing
 * parity case fail on a card that has no variants at all.
 */
function extendCard(card: Bag): void {
  if (card['variants'] !== undefined) {
    const variants = readVariants(card['variants']);
    if (variants.length === 0) {
      delete card['variants'];
    } else {
      card['variants'] = variants;
    }
  }
  // An unrecognised stock state reaches a class name and a badge, so it is
  // dropped rather than passed through — the `layout` rule.
  if (card['stock'] !== undefined && !isStock(card['stock'])) {
    delete card['stock'];
  }
}

/**
 * The four commerce fields, read over an envelope the base reader produced.
 *
 * Deliberately a SECOND PASS rather than a hook inside the base reader. The
 * base reader threads nothing and knows nothing about this function, which is
 * what lets rollup drop it out of `widget.js` at the module edge; a parameter
 * would have put a call site for it in first paint.
 *
 * It returns null for the same reason the base reader does — nothing
 * survived — which happens when the only block was an `order_status` whose
 * steps are all unreadable.
 */
export function extendCommerceBlocks(envelope: WidgetBlocksEnvelope): WidgetBlocksEnvelope | null {
  const blocks: WidgetBlock[] = [];
  for (const block of envelope.blocks) {
    const bag = block as unknown as Bag;
    if (bag['type'] === 'card') {
      extendCard(bag);
    } else if (bag['type'] === 'card_grid') {
      for (const card of bag['cards'] as Bag[]) {
        extendCard(card);
      }
      if (bag['more'] !== undefined) {
        const more = readGridMore(bag['more']);
        if (more === null) {
          delete bag['more'];
        } else {
          bag['more'] = more;
        }
      }
    } else if (bag['type'] === 'order_status') {
      const steps = readTimelineSteps(bag['steps']);
      // No readable step is no timeline: a bordered blank space where the
      // answer to "where is my order" belongs. Same rule as `quick_replies`.
      if (steps.length === 0) {
        continue;
      }
      /*
       * A COPY, not a mutation. The base reader passes this block type
       * through as the caller's own object (like `text` and `divider`), and
       * writing `steps` back into it would edit the `messages.blocks` value
       * the host handed us.
       */
      blocks.push({ ...bag, steps } as unknown as WidgetBlock);
      continue;
    }
    blocks.push(block);
  }
  return blocks.length > 0 ? { v: envelope.v, blocks } : null;
}
