/**
 * Reading a rich-block envelope for RENDERING, with no dependencies.
 *
 * ── Two readers, and why the split is by direction, not by app ──────────
 *
 * `parseBlocksEnvelope` (zod, `schema.ts`) is the WRITE validator. It is
 * `.strict()` on every block and refuses the whole envelope on anything it
 * does not recognise, which is what you want of a boundary that decides what
 * gets stored.
 *
 * This is the READ validator, and strictness is wrong here in both of the
 * ways it can be wrong:
 *
 *  - A renderer that refuses the whole envelope over one malformed block
 *    shows the visitor nothing where it could have shown four good cards.
 *  - A renderer that refuses an unknown KEY blanks the screen on a forward
 *    rollout. Add `card.accent` in a later release, still `v: 1`, and every
 *    dashboard tab running the previous bundle — an SPA, cached for days —
 *    drops the entire grid while the visitor's freshly-loaded widget shows it
 *    in full. The agent cannot see what the visitor is looking at.
 *
 * So this reader DROPS what it cannot read and keeps the rest, passes unknown
 * keys through untouched, and returns null only when nothing survived.
 *
 * It began life inside `apps/widget` to keep zod out of a 50,000-byte bundle,
 * which is still why it imports nothing: the type imports below are erased,
 * and `./protocol.js` and `./href-guard.js` are both zod-free. It moved here
 * because the dashboard and mobile were using the zod schema to render — the
 * forward-rollout blanking above — and because two hand-written readers of
 * one format drift in silence. There is one reader now.
 *
 * ── THREE exports, and which one costs a visitor bytes ──────────────────
 *
 * `readBlocksEnvelope` is unchanged and is what every surface but the widget
 * imports. It is now a COMPOSITION of the two functions below, and the split
 * is about the widget's first-paint budget rather than about behaviour:
 *
 *   readBlocksEnvelopeBase    everything except four fields — HERE
 *   extendCommerceBlocks      `card.variants`, `card.stock`,
 *                             `card_grid.more`, `order_status.steps` —
 *                             `read-envelope-commerce.ts`, re-exported here
 *   readBlocksEnvelope        base ∘ extend — byte-for-byte what it was
 *
 * Those four fields cost **297 bytes gzipped** of `widget.js`, which every
 * visitor on every customer page downloads whether or not they ever open the
 * chat (CLAUDE.md §2: the 44,000-byte first-paint ceiling has never been
 * raised). The widget imports the BASE at first paint and gets the extension
 * from `widget-commerce.js`, the chunk it already fetches on a card action —
 * so a card carrying variants is read in full by the time it is drawn, and a
 * page whose conversations never carry one pays nothing.
 *
 * **The deferral is enforced by the budget gate and nothing else.** Rollup
 * drops `extendCommerceBlocks` from the widget bundle because the widget
 * imports only `readBlocksEnvelopeBase`; if that tree-shake ever stops
 * working, those 297 bytes come back and
 * `node scripts/check-bundle-size.mjs` fails on the same commit. There is no
 * second mechanism, and that is deliberate: a measurement is a better guard
 * than an assertion about a bundler.
 *
 * Which means the rule for editing this file: the base reader may not
 * reference anything the extension declares, or the shake stops at the first
 * edge between them. The extension moved into
 * `read-envelope-commerce.ts` on 2026-10-24 — this file was at 648 lines
 * against a 650-line ceiling — which makes that rule a module boundary rather
 * than a convention, and the shared helpers the two halves both need are a
 * leaf below both (`read-primitives.ts`) rather than exports of this file.
 * The move was measured: every one of the six artifacts came out within two
 * bytes of where it was, because rollup was already making this cut at the
 * export boundary.
 *
 * ── Where the 2026-10-22 additions went ─────────────────────────
 *
 * `card.badge` became a three-way union, `card.reactions` arrived, and so did
 * the `table` block. All three are read in the BASE; only one had a choice.
 *
 * BADGE NORMALISATION cannot be deferred, and the reason is not an argument:
 * `apps/widget/src/blocks/render.tsx` draws `{card.badge}` as a text child at
 * first paint today, so handed the object form it renders whatever preact
 * makes of an object. The collapse has to happen before the FIRST renderer
 * sees the value, and first paint is the first renderer. Doing it at the read
 * is the argument this whole file rests on: four renderers each branching on
 * three spellings is four chances to differ, and three of those branches
 * would be drawing a shape nobody sends today — untested in production.
 *
 * `reactions` is filtered in the base for a reason the byte argument does not
 * reach: the commerce chunk is requested per FIELD, so a recommendation card
 * carrying reactions and no commerce field fetches nothing at all, and
 * leaving them to the extension would leave them unread for ever on exactly
 * the card the feature exists for.
 *
 * The `table` BLOCK had no choice either, and the deciding question is not
 * the chunk's usual one. `extendCommerceBlocks` runs over what the base
 * RETURNED, so a block type the base drops is unrecoverable: the chunk could
 * not read a table back if it wanted to, and first paint could not see one
 * arrived in order to ask for the chunk. Only its row validation could have
 * been deferred, and that is here because the one sink in a table is
 * `columns[].image`, an `<img src>` — a safety guard, not a decoration — and
 * because a first-paint fallback over unvalidated rows is a second copy of
 * the rule, which is what `order_status` pays for its deferral.
 */
import { isSafeMediaSrc } from './href-guard.js';
import { readMoney } from './money.js';
import { BLOCK_PROTOCOL_VERSION } from './protocol.js';
import { readCardTapAction } from './read-card-action.js';
import { extendCommerceBlocks } from './read-envelope-commerce.js';
import { isBag, readAction, readActions, str, type Bag } from './read-primitives.js';
import { normaliseCardFeedback } from './read-reactions.js';
import { extendSpatial } from './read-spatial.js';

import type { WidgetBlock, WidgetBlocksEnvelope, WidgetCard } from './schema.js';

/*
 * Re-exported, NOT redeclared. `read-envelope-commerce.ts` holds it now and
 * says why; this line is what keeps the `widget-blocks/read-envelope` subpath
 * exporting exactly the three names it exported before the split, so the
 * widget's `commerce-chunk.ts` and every spec that imports the pair from here
 * are untouched. Rollup shakes a re-export like any other binding, which the
 * budget gate is what proves.
 */
export { extendCommerceBlocks };

/**
 * What a badge MEANS, not what colour it is: "Great price" and "Above
 * typical" are both badges and say opposite things. `cardBadgeSchema` in the
 * write schema argues it at length; `neutral` is the absence of a claim.
 */
export type WidgetCardBadgeTone = 'success' | 'warning' | 'danger' | 'neutral';

/**
 * The ONE badge shape every renderer sees, whichever of the three the author
 * sent. `tone` is always present — see `readCardBadges`.
 */
export interface WidgetCardBadge {
  readonly text: string;
  readonly tone: WidgetCardBadgeTone;
}

/**
 * A card as this reader GUARANTEES it, which is not what the schema accepts.
 *
 * `WidgetCard` is `z.infer` of the WRITE schema, where `badge` is a string,
 * an object, or an array of either. Nothing downstream should have to know
 * that — the reader has collapsed it. Renderers annotate with this. Type
 * only, so it costs no bytes.
 */
export type ReadCard = Omit<WidgetCard, 'badge'> & {
  readonly badge?: readonly WidgetCardBadge[];
};

/**
 * Badges, collapsed to one shape: ALWAYS an array of `{ text, tone }`.
 *
 * Exported because `plain-text.ts` needs the same collapse and must not
 * re-derive it: that file's creed is one function so the API, the worker and
 * the widget cannot disagree about what a card said, and a badge the text
 * spine spells differently from the renderers is that defect one layer down.
 * Idempotent, so an already-read card and a freshly parsed one both pass.
 *
 * A bare string becomes `tone: 'neutral'` — the common path, not the legacy
 * one: it is what every stored row holds and what every integrator sends.
 *
 * `tone` is COERCED and never dropped, the `order_status[].state` rule: it
 * reaches a class name so it cannot pass through unrecognised, and dropping
 * the badge over an unknown tone would delete the words "Final sale" to
 * protect the colour of a pill. It is always PRESENT for the mirror-image
 * reason — an absent tone leaves each renderer to pick its own default for a
 * value that reaches a class name, which is four defaults.
 *
 * NOT capped at `MAX_CARD_BADGES`: this reader enforces no cardinality cap
 * anywhere, because a cap is a write decision and a renderer handed three
 * draws three.
 */
export function readCardBadges(raw: unknown): WidgetCardBadge[] {
  const out: Bag[] = [];
  for (const entry of Array.isArray(raw) ? raw : [raw]) {
    const badge: Bag = str(entry) ? { text: entry } : isBag(entry) ? { ...entry } : {};
    if (!str(badge['text'])) {
      continue;
    }
    const tone = badge['tone'];
    if (tone !== 'success' && tone !== 'warning' && tone !== 'danger') {
      badge['tone'] = 'neutral';
    }
    out.push(badge);
  }
  return out as unknown as WidgetCardBadge[];
}

/**
 * A `{label, value}` pair where both halves are readable.
 *
 * ONE function for a card's `fields`, a `fields` block's `items` and a
 * `quick_replies` block's `options`, because the rule is the same rule and it
 * is the same rule for the same reason: a row with no label is unreadable and
 * a chip with no value is unanswerable. They were two byte-identical
 * functions, which is two places for the rule to change in one of them.
 */
function readPairs(raw: unknown): Array<{ label: string; value: string }> {
  return Array.isArray(raw)
    ? raw.filter(
        (f): f is { label: string; value: string } =>
          isBag(f) && str(f['label']) && str(f['value']),
      )
    : [];
}

/** A card body, with the bits it cannot read dropped rather than the whole card. */
function readCard(raw: unknown): Bag | null {
  if (!isBag(raw) || !str(raw['title'])) {
    return null;
  }
  const card: Bag = {
    ...raw,
    actions: readActions(raw['actions']),
    fields: readPairs(raw['fields']),
  };
  /*
   * The tap action, or no key at all. `readCardTapAction` returns null for
   * anything unusable, and an ABSENT key is what every renderer already
   * branches on — `action: null` would be a third state each of the four has
   * to handle and three of them would forget.
   */
  const tap = readCardTapAction(card['action'], readAction);
  if (tap === null) {
    delete card['action'];
  } else {
    card['action'] = tap;
  }
  // An unsafe image drops the image, not the card: the title, fields and
  // actions are the card's substance and all still render.
  if (card['image'] !== undefined && !(str(card['image']) && isSafeMediaSrc(card['image']))) {
    delete card['image'];
  }
  /*
   * An unreadable price drops the price, for the same reason an unsafe image
   * drops the image — except that the consequence of NOT dropping it is
   * worse than a missing picture: `formatMoney` would be handed a string or
   * a float and the shopper would read `NaN` or `$48.199999999999996` where
   * a price belongs. Normalised rather than passed through, so the renderers
   * never see a `compareAt` that is not a number.
   */
  if (card['price'] !== undefined) {
    const price = readMoney(card['price']);
    if (price === null) {
      delete card['price'];
    } else {
      card['price'] = price;
    }
  }
  /*
   * The badge, COLLAPSED rather than passed through: the only field in the
   * protocol with three accepted spellings. See `readCardBadges`. No readable
   * badge drops the KEY and keeps the card, like `variants` below.
   */
  if (card['badge'] !== undefined) {
    const badges = readCardBadges(card['badge']);
    if (badges.length === 0) {
      delete card['badge'];
    } else {
      card['badge'] = badges;
    }
  }
  normaliseCardFeedback(card);
  /*
   * `variants` and `stock` are NOT normalised here — `extendCommerceBlocks`
   * does it, over this card object, and `readBlocksEnvelope` runs both. They
   * reach this point as unknown keys and are passed through untouched, which
   * is the same thing this reader does with `card.accent` from a server a
   * release ahead of it: see the header for why the four commerce fields are
   * deferred and what happens if the shake that defers them breaks.
   */
  return card;
}

/**
 * A comparison table: the things across, their attributes down.
 *
 * ── Why a bad COLUMN is coerced and a bad ROW is dropped ──────────────
 *
 * Not the same mistake. A row is identified by its own label, so a row
 * without one is a line of values nobody can interpret and it goes, the way a
 * half-formed variant goes. A COLUMN is identified by its POSITION: drop
 * column 1 and every row's cells shift left, so "USD 120.00" is drawn under
 * the wrong product — a wrong answer rather than a missing one, which is the
 * worst of the outcomes this reader picks between. So an unreadable heading
 * is coerced to an empty one and keeps its place: a blank heading over a real
 * column is a gap, a shifted one is a lie.
 *
 * A table with no readable heading AT ALL is dropped: the headings make it a
 * comparison rather than a list, and `fields` is the block for a list.
 * Cells are coerced to strings for the same positional reason. A row LONGER
 * than the table is truncated — the write boundary refuses one outright
 * (`widgetBlocksEnvelopeSchema`'s last refinement) and a seventh cell under
 * no heading is a column the reader invented. A SHORT row is deliberately
 * fine and renders blanks; the schema's note says why. `columns[].image` is
 * the one sink here, an `<img src>`: an unsafe one drops the IMAGE and not
 * the column, the `card.image` rule, and the reason this is not deferred.
 */
function readTable(raw: Bag): Bag | null {
  const columns: Bag[] = [];
  for (const entry of Array.isArray(raw['columns']) ? raw['columns'] : []) {
    const column: Bag = isBag(entry) ? { ...entry } : {};
    if (!str(column['label'])) {
      column['label'] = '';
    }
    if (
      column['image'] !== undefined &&
      !(str(column['image']) && isSafeMediaSrc(column['image']))
    ) {
      delete column['image'];
    }
    columns.push(column);
  }
  if (!columns.some((column) => column['label'] !== '')) {
    return null;
  }
  const rows: Bag[] = [];
  for (const entry of Array.isArray(raw['rows']) ? raw['rows'] : []) {
    if (!isBag(entry) || !str(entry['label'])) {
      continue;
    }
    const cells = (Array.isArray(entry['cells']) ? entry['cells'] : [])
      .slice(0, columns.length)
      .map((cell) => (typeof cell === 'string' ? cell : ''));
    rows.push({ ...entry, cells });
  }
  /*
   * No readable row is no comparison: a heading row over a bordered blank
   * space. The `quick_replies` and `order_status` rule.
   */
  return rows.length > 0 ? { ...raw, columns, rows } : null;
}

function readBlock(raw: unknown): WidgetBlock | null {
  if (!isBag(raw)) {
    return null;
  }
  switch (raw['type']) {
    case 'text':
      return str(raw['markdown']) ? (raw as unknown as WidgetBlock) : null;
    case 'media':
      // Unlike a card's image, a media block IS its image. Nothing is left to
      // render once the src is refused, so the block goes.
      return str(raw['url']) &&
        isSafeMediaSrc(raw['url']) &&
        str(raw['alt']) &&
        (raw['kind'] === 'image' || raw['kind'] === 'video')
        ? (raw as unknown as WidgetBlock)
        : null;
    case 'fields': {
      const items = readPairs(raw['items']);
      return items.length > 0 ? ({ ...raw, items } as unknown as WidgetBlock) : null;
    }
    case 'card': {
      const card = readCard(raw);
      return card === null ? null : (card as unknown as WidgetBlock);
    }
    case 'card_grid': {
      const cards = Array.isArray(raw['cards'])
        ? raw['cards'].map(readCard).filter((c): c is Bag => c !== null)
        : [];
      if (cards.length === 0) {
        return null;
      }
      const grid: Bag = { ...raw, cards };
      /*
       * `layout` reaches a CLASS NAME, so an unrecognised value is dropped
       * rather than passed through. Everything else in this reader passes
       * unknown keys along for forward-rollout reasons; a key the renderer
       * interpolates is the exception, because `cl-blk-grid--<whatever>`
       * matches no rule and the grid would render unstyled instead of as a
       * plain stack.
       */
      if (grid['layout'] !== 'grid' && grid['layout'] !== 'carousel' && grid['layout'] !== 'auto') {
        delete grid['layout'];
      }
      // `more`, like a card's `variants`, is left to `extendCommerceBlocks`.
      return grid as unknown as WidgetBlock;
    }
    case 'actions': {
      const actions = readActions(raw['actions']);
      return actions.length > 0 ? ({ ...raw, actions } as unknown as WidgetBlock) : null;
    }
    case 'quick_replies': {
      const options = readPairs(raw['options']);
      // No readable option is no question: a row of chips with nothing in it
      // is a blank space under a message.
      return options.length > 0 ? ({ ...raw, options } as unknown as WidgetBlock) : null;
    }
    case 'table': {
      const table = readTable(raw);
      return table === null ? null : (table as unknown as WidgetBlock);
    }
    case 'status':
      // `id` is required: a status block exists to be patched.
      return str(raw['id']) && str(raw['text']) ? (raw as unknown as WidgetBlock) : null;
    /*
     * `order_status` passes through UNREAD, and that is the one place the base
     * reader is laxer than the whole one rather than merely quieter.
     *
     * Its `steps` are validated by `extendCommerceBlocks`, which also drops
     * the block when no step survives — so `readBlocksEnvelope` behaves
     * exactly as it did. What the base reader alone returns is a block whose
     * `steps` nobody has checked, and the single caller that uses it alone is
     * the widget's first paint, which draws NOTHING for this type until the
     * commerce chunk lands (`blocks/render.tsx`). The message's plain-text
     * body carries the timeline meanwhile — `blocksToPlainText` renders every
     * step, which on SMS is all the customer ever gets.
     *
     * Dropping it here instead would have been tidier and would also have
     * made the field unreachable: first paint has to SEE the block to know it
     * must fetch the chunk that draws it.
     */
    /*
     * `sources` passes through unread for the same reasons and with the same
     * consequence. Its `items` are validated by `extendCommerceBlocks`,
     * which drops the block when no item survives, so `readBlocksEnvelope`
     * is unchanged; what the base reader alone returns is a block whose
     * titles nobody has checked and whose `url` has not been through
     * `isSafeActionHref`. **Nothing in first paint may render either.** The
     * widget draws nothing for this type until the commerce chunk lands, and
     * the plain-text body carries the citations meanwhile —
     * `blocksToPlainText` renders every one, which on SMS is all the
     * customer ever gets.
     *
     * Reading it here instead was built and measured: 37 gzipped bytes of
     * `widget.js` for a check nothing at first paint can reach, against a
     * ceiling that has never moved.
     */
    case 'order_status':
    case 'sources':
    case 'divider':
      return raw as unknown as WidgetBlock;
    // `place` is a block TYPE, so the base keeps it; see `read-spatial.ts`.
    case 'place':
      /*
       * `raw`, not `{ ...raw }`, like every other pass-through arm here.
       *
       * The copy was load-bearing and is now made where the MUTATION is:
       * `extendSpatial` deletes a non-string `detail`/`ref` in place, and
       * `spatial.spec.ts` pins that the caller's own object survives it. But
       * that pass runs only in `readBlocksEnvelope` below — never in
       * `readBlocksEnvelopeBase`, which is the widget's first paint. So this
       * arm was paying 6 gzipped bytes on every page view of every customer
       * site to protect a mutation first paint cannot perform. Copying in the
       * composed reader costs first paint nothing and puts the copy next to
       * the thing it guards, which is where `extendCommerceBlocks`' own
       * `order_status` copy already lives.
       */
      return str(raw['label']) ? (raw as unknown as WidgetBlock) : null;
    default:
      // An unknown type is expected, not exceptional: an old client meets a
      // newer server. Drop it and render the rest.
      return null;
  }
}

/**
 * The reader minus the four commerce fields — and nothing else: the header
 * says why `card.badge`, `card.reactions` and the whole `table` block are
 * read HERE rather than in the extension.
 *
 * Exported for ONE caller — the widget's first paint — and named so a second
 * one has to think about it. Every other surface wants `readBlocksEnvelope`.
 */
export function readBlocksEnvelopeBase(raw: unknown): WidgetBlocksEnvelope | null {
  if (!isBag(raw) || raw['v'] !== BLOCK_PROTOCOL_VERSION || !Array.isArray(raw['blocks'])) {
    return null;
  }
  const blocks = raw['blocks'].map(readBlock).filter((b): b is WidgetBlock => b !== null);
  return blocks.length > 0 ? { v: BLOCK_PROTOCOL_VERSION, blocks } : null;
}

/**
 * The whole reader. What every surface but the widget's first paint imports.
 *
 * Base, then commerce, then `read-spatial.ts`. The header says why they split.
 */
export function readBlocksEnvelope(raw: unknown): WidgetBlocksEnvelope | null {
  const base = readBlocksEnvelopeBase(raw);
  const envelope = base === null ? null : extendCommerceBlocks(base);
  if (envelope === null) {
    return null;
  }
  /*
   * The spatial pass is composed HERE and not inside `extendCommerceBlocks`,
   * so the widget's commerce chunk (which imports only that) carries none of
   * it.
   *
   * A `place` block is COPIED first, because `extendSpatial` mutates and the
   * base reader hands that type back as the caller's own object — see its arm
   * for why the copy moved out of there. Only `place`: the two other types
   * `extendSpatial` touches are `card` and `card_grid`, whose bodies
   * `readCard` has already rebuilt.
   */
  const blocks = envelope.blocks.map((block) => {
    const bag = (block.type === 'place' ? { ...block } : block) as unknown as Bag;
    extendSpatial(bag);
    return bag as unknown as WidgetBlock;
  });
  return { v: envelope.v, blocks };
}
