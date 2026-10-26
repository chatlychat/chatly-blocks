/**
 * The rich-block wire format.
 *
 * ── Why one `card` and not a vertical library ───────────────────────────
 *
 * A product card, a booking card and an invoice card differ only in which
 * `fields` and which `actions` they carry. Naming the verticals makes every
 * new business type a roadmap ticket; typed fields plus typed actions plus
 * author-supplied labels cover verticals nobody has thought of yet.
 *
 * Shaped after Microsoft Adaptive Cards — same concepts, similar names —
 * without claiming compliance. Beyond familiarity there is a concrete
 * benefit: LLMs have seen a great deal of Adaptive Cards JSON, so our own
 * agent emits this shape reliably.
 *
 * Caps exist on every collection. An uncapped `blocks` array is a way for one
 * message to render a page-long tree in a 380px panel.
 */
import { z } from 'zod';

import { cardTapActionSchema, widgetActionSchema } from './actions.js';
import { blockId } from './block-id.js';
import {
  MAX_FIELDS_PER_BLOCK,
  MAX_ORDER_STATUS_STEPS,
  MAX_VARIANTS_PER_CARD,
  fieldSchema,
  gridMoreSchema,
  moneySchema,
  orderStatusStepSchema,
  stockSchema,
  variantSchema,
} from './block-values.js';
import { MAX_CARD_ACTIONS, cardBadgeFieldSchema, cardReactionSchema } from './card-fields.js';
import { mediaSrcSchema } from './media-src.js';
import { BLOCK_PROTOCOL_VERSION } from './protocol.js';
import { gridPlacementSchema, modelSchema, placeBlockSchema } from './spatial-schema.js';
import { tableBlockSchema } from './table-schema.js';

export { BLOCK_PROTOCOL_VERSION };
export { MAX_CARD_ACTIONS, MAX_CARD_ACTIONS_VISIBLE, MAX_CARD_BADGES } from './card-fields.js';
export { MAX_TABLE_COLUMNS, MAX_TABLE_ROWS } from './table-schema.js';
/*
 * The caps that moved to `block-values.ts` with the schemas they bound, kept
 * exported from HERE for the reason `MAX_CARD_BADGES` above is: every reader
 * of the limits imports them from the schema, and a split is not a reason to
 * make them learn a second path.
 */
export { MAX_FIELDS_PER_BLOCK, MAX_ORDER_STATUS_STEPS, MAX_VARIANTS_PER_CARD };

/** Caps. Chosen to be generous for real cards and hostile to accidents. */
export const MAX_BLOCKS_PER_MESSAGE = 50;
export const MAX_CARDS_PER_GRID = 24;
/**
 * Quick replies offered at once.
 *
 * Eight, and the number is the point rather than a round figure: they are
 * rendered as a wrapped row in a 380px panel, and a ninth chip pushes the
 * composer off the screen on a phone. A set of options that needs more than
 * eight is a `select` input on a Tier 2 step, not a row of chips.
 */
export const MAX_QUICK_REPLIES = 8;
/**
 * Badges on one card.
 *
 * Two, because the common pair is a fact and a verdict — "Sale" beside
 * "Above typical" — and they mean opposite things in one colour, which is
 * the whole reason `tone` exists. A third is a card arguing with itself.
 */
/**
 * A `table` block's shape.
 *
 * Six columns because the panel is 380px and a table scrolls sideways: at
 * seven the first column's label is off screen before the reader has found
 * the row they came for. Twelve rows because a comparison a shopper reads in
 * a chat bubble is a handful of attributes, and more is a page on the
 * merchant's own site — the same line `MAX_CARDS_PER_GRID` draws.
 */

/** `card` without its discriminator — one shape standing alone or in a grid. */
const cardBodySchema = z
  .object({
    id: blockId.optional(),
    title: z.string().min(1).max(200),
    subtitle: z.string().min(1).max(400).optional(),
    image: mediaSrcSchema.optional(),
    badge: cardBadgeFieldSchema.optional(),
    /**
     * A price, rendered in the VISITOR's locale.
     *
     * A `fields` row could already say `Price: $48.20`, and a listing card
     * that does so is a string the author formatted — in their own locale, for
     * every shopper. This is the typed version: minor units plus a currency,
     * formatted by the reader's browser.
     */
    price: moneySchema.optional(),
    fields: z.array(fieldSchema).max(MAX_FIELDS_PER_BLOCK).optional(),
    /**
     * Pickable options, rendered as a select.
     *
     * `.min(1)` as well as `.max`: an empty array is a dropdown with nothing
     * in it, which is a control a shopper can focus and not use. An author
     * with no options omits the key.
     */
    variants: z.array(variantSchema).min(1).max(MAX_VARIANTS_PER_CARD).optional(),
    stock: stockSchema.optional(),
    /** A 3D model for a world surface. Ignored, unread and unfetched everywhere else. */
    model: modelSchema.optional(),
    actions: z.array(widgetActionSchema).max(MAX_CARD_ACTIONS).optional(),
    /**
     * A like/dislike pair on the card, and the state the widget keeps.
     *
     * Feedback that steers the next answer is the core loop of a
     * recommendation bot, and spending two of the five visible actions on it
     * is what this avoids. A press delivers a silent postback carrying
     * `{ card, reaction }` under the reserved `card.reaction` key — the same
     * road a `postback` action already travels, so there is no sixth action
     * kind and no second route for a bot author to learn.
     *
     * An ARRAY and not a boolean so a card can offer one without the other
     * (a "save this" thumb with no thumb down), and `.min(1)` because an
     * empty array is a toggle pair with nothing in it.
     *
     * `reactions` is what the card OFFERS. `reaction` below is what it is
     * currently SET to. The widget still never writes either.
     */
    reactions: z.array(cardReactionSchema).min(1).max(2).optional(),
    /**
     * Tapping the card's image or title does this.
     *
     * ── Why a card needs one at all ────────────────────────────────────────
     *
     * Because a product card that is not tappable is not how anyone expects a
     * product card to behave. The buttons stay as they are; this is the
     * affordance of the photo and the name.
     *
     * Which kinds, and why `postback` is not one of them: see
     * `cardTapActionSchema`.
     *
     * ── The one rendering constraint, and it is an accessibility one ───────
     *
     * The image and title become a SINGLE link or button. The card itself does
     * NOT become tappable, even though that is the obvious reading of "tap the
     * card": a tappable element CONTAINING buttons is nested interactive
     * targets, which breaks keyboard navigation (the inner buttons become
     * unreachable or double-activate) and makes a screen reader announce one
     * control containing others. Every renderer here does it the same way and
     * `check-block-field-parity` is what holds them to it.
     *
     * Its positional id is `…a-1` — see `action-id.ts`. A card-level action is
     * not at index 0 of `actions`, and giving it one would collide with the
     * first button's ref and send `reportAction` results to the wrong control.
     */
    action: cardTapActionSchema.optional(),
    /**
     * The reaction the card currently shows as chosen — set by the AUTHOR.
     *
     * ── The inconsistency this exists to fix ───────────────────────────────
     *
     * The widget holds a visitor's tap for the life of the page and stores
     * nothing, which the docs said plainly. An integrator pointed out what
     * that means on the second page view, and they were right:
     *
     *   "The bot still remembers the reaction and keeps ranking on it, so
     *    after a reload the visitor sees an un-pressed 👎 on a card that is
     *    still being held against them, with no way to see what they rated."
     *
     * That is not a cosmetic gap. The visitor cannot see, or undo, a verdict
     * that is actively shaping their results.
     *
     * ── Why the AUTHOR sets it, and the widget still does not ──────────────
     *
     * The original objection to storing the toggle stands and is unchanged:
     * `messages.blocks` is author content replaced wholesale by
     * `PATCH …/blocks`, so a VIEWER's tap written there would race the
     * author's patch and be attributed to the wrong actor.
     *
     * A bot setting this field is not a viewer's tap. The bot is the author,
     * and the thing it is writing is its own belief about what it is ranking
     * on — which is exactly the state that needs to survive a reload, and the
     * only copy of it that is authoritative. So the widget remains
     * write-only-never, and the field is honest about whose claim it is.
     *
     * ── What it does NOT give you ──────────────────────────────────────────
     *
     * This is not per-viewer storage. A card with `reaction` set shows the
     * same thing to everyone who can see that message — for a 1:1
     * conversation, the one visitor and the agents reading the transcript.
     * Durable per-viewer state would still need its own table.
     *
     * A value not listed in `reactions` is DROPPED; `read-reactions.ts` says
     * why, where it is enforced.
     */
    reaction: cardReactionSchema.optional(),
  })
  .strict();

export const widgetBlockSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('text'),
      id: blockId.optional(),
      markdown: z.string().min(1).max(4000),
    })
    .strict(),
  z
    .object({
      type: z.literal('media'),
      id: blockId.optional(),
      url: mediaSrcSchema,
      alt: z.string().min(1).max(300),
      kind: z.enum(['image', 'video']),
      aspect: z.string().max(12).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('fields'),
      id: blockId.optional(),
      items: z.array(fieldSchema).min(1).max(MAX_FIELDS_PER_BLOCK),
    })
    .strict(),
  cardBodySchema.extend({ type: z.literal('card') }).strict(),
  z
    .object({
      type: z.literal('card_grid'),
      id: blockId.optional(),
      cards: z.array(cardBodySchema).min(1).max(MAX_CARDS_PER_GRID),
      columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      /**
       * How the grid is laid out. `grid` (the default, and what every stored
       * row means) stacks into `columns`; `carousel` is one horizontally
       * scrolling row with snap points.
       *
       * A carousel exists because ten listings stacked vertically is a
       * scroll through a 380px panel that buries the composer, and because a
       * shopper comparing options wants them side by side. `columns` is
       * IGNORED under `carousel` — a horizontal row has one — and that is
       * stated here rather than refused, since a workspace switching an
       * existing grid to a carousel should not have to delete a field first.
       */
      /*
       * `'auto'` added 2026-10-23: a carousel below a width threshold and a
       * grid above it, decided by the CONTAINER rather than by the message.
       *
       * The same message reads best as a carousel in the 380px launcher panel
       * and as a three- or four-column grid in a full-page `mount()` view, and
       * `layout` is fixed per message so an author had to choose one and be
       * wrong in the other place.
       *
       * ── Why `'auto'` and not `inlineLayout` ───────────────────────────────
       *
       * The integrator offered both. A per-surface override ("this layout when
       * mounted inline") is the wrong axis: a mounted view can be narrow too —
       * a sidebar, a half-width column, a phone — so keying off WHICH mount it
       * is gets those wrong in the same way the fixed value does. Width is the
       * thing that actually decides, so width is what is measured.
       *
       * It is also free: a CSS container query needs no JavaScript, no
       * ResizeObserver and no byte of measurement code, which matters against
       * a first-paint budget with about a kilobyte of headroom.
       */
      layout: z.enum(['grid', 'carousel', 'auto']).optional(),
      /**
       * A trailing tile, so a grid at its cap is not a dead end.
       *
       * It is NOT counted against `MAX_CARDS_PER_GRID`: a full grid is the
       * case this exists for, and a cap that consumed a card to offer the
       * next page would make the feature unreachable exactly when it matters.
       * So the grid renders up to `MAX_CARDS_PER_GRID` + 1 tiles.
       */
      more: gridMoreSchema.optional(),
      /** How a world arranges the cards. A 2D surface still draws `layout`. */
      placement: gridPlacementSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('actions'),
      id: blockId.optional(),
      actions: z.array(widgetActionSchema).min(1).max(8),
    })
    .strict(),
  /**
   * Chips offered under a message, retired the moment one is tapped.
   *
   * Distinct from an `actions` block, which is a standing menu that stays on
   * screen: these are a prompt for the NEXT turn. "Under $50 / $50-$100 /
   * Over $100" is a question, and a question still showing its options after
   * it has been answered invites a shopper to answer it twice.
   *
   * Each option carries a `label` the visitor reads and a `value` the bot
   * receives. The two are separate for the same reason `postback.payload`
   * exists: "Under $50" is for a person and `under_50` is for a program.
   */
  z
    .object({
      type: z.literal('quick_replies'),
      id: blockId.optional(),
      options: z
        .array(
          z
            .object({ label: z.string().min(1).max(40), value: z.string().min(1).max(400) })
            .strict(),
        )
        .min(1)
        .max(MAX_QUICK_REPLIES),
      /**
       * Deliver the tap to the bot without a visitor bubble.
       *
       * Same mechanism and the same limits as `postback.silent` — see the
       * note there, including why "hidden" means hidden from the thread the
       * visitor is reading and not from the agent who takes over.
       */
      silent: z.boolean().optional(),
    })
    .strict(),
  // `id` REQUIRED: a status block exists to be patched when the work finishes.
  z
    .object({
      type: z.literal('status'),
      id: blockId,
      text: z.string().min(1).max(200),
      done: z.boolean().optional(),
    })
    .strict(),
  /**
   * A read-only fulfilment timeline. Display only — there is no money here.
   *
   * This is the half of Crossly's 3.1 that we agreed to: a `checkout` block
   * was refused because it would put us in the payment path, and a timeline
   * is the part of an order a support conversation actually needs. Nothing in
   * it is a control: no action, no amount, no payment reference. "Where is my
   * order" answered in the thread, rather than a link out to a tracking page
   * the shopper has to find their order number for.
   *
   * `id` is optional, like every block but `status`. An author who intends to
   * advance the timeline with `applyBlockPatches` — "Shipped" becoming `done`
   * when it ships — sets one; one that is sent once and never touched does
   * not need a name.
   */
  z
    .object({
      type: z.literal('order_status'),
      id: blockId.optional(),
      /*
       * `.min(1)`: a timeline with no steps is a blank space with a border
       * round it. The read path drops such a block for the same reason.
       */
      steps: z.array(orderStatusStepSchema).min(1).max(MAX_ORDER_STATUS_STEPS),
    })
    .strict(),
  tableBlockSchema,
  placeBlockSchema,
  z.object({ type: z.literal('divider'), id: blockId.optional() }).strict(),
]);

/**
 * The whole envelope's serialised size, in bytes.
 *
 * The per-collection caps above are each reasonable and multiply out to
 * something absurd: 50 blocks x 24 cards x 20 fields x 5 actions, with a
 * 2000-character `copy.text` on each, is roughly 23 MB. Nothing downstream
 * wants that. `blocksToPlainText` would hand `messages.body` about a megabyte,
 * which is Postgres's `tsvector` ceiling, so conversation search would start
 * failing on the index rather than on the request.
 *
 * The commerce additions multiply out the same way, and the arithmetic is
 * stated rather than assumed because the first of the three is the biggest
 * single contributor in the format:
 *
 *   - `card.variants` — 50 blocks x 24 cards x 20 variants x (40 + 400
 *     characters plus JSON scaffolding) is about 11 MB on its own, a HALF
 *     again on top of the figure above. It is bounded in practice by nothing
 *     but this cap.
 *   - `order_status.steps` — 50 x 8 x (80 + a timestamp + an enum) is about
 *     84 KB. Negligible, and that is a property of `MAX_ORDER_STATUS_STEPS`
 *     being eight rather than a carrier's twenty-plus scans.
 *   - `card_grid.more` — one object per grid, so 50 labels plus 50 actions.
 *     Negligible, EXCEPT that its action may be a `postback` whose `payload`
 *     is a record of unknown with no key count — which is already true of
 *     every card action and is exactly what this cap is the only bound on.
 *
 * Until this existed the only bound was Fastify's default 1 MiB body limit —
 * a limit on the request, not on this payload, and one that `actions.ts` was
 * describing as if it were a cap on `host_event.data`. 32 KiB is far more than
 * a rich card tree needs and far less than any consumer minds.
 */
export const MAX_ENVELOPE_BYTES = 32_768;

export const widgetBlocksEnvelopeSchema = z
  .object({
    v: z.literal(BLOCK_PROTOCOL_VERSION),
    blocks: z.array(widgetBlockSchema).min(1).max(MAX_BLOCKS_PER_MESSAGE),
  })
  .strict()
  /**
   * Ids are unique within one message, counting a grid's cards.
   *
   * `applyBlockPatches` resolves an id at the top level and then inside each
   * `card_grid`. Two blocks answering to one name would make that resolution
   * depend on document order, and every renderer keys its list by `block.id`.
   * Uniqueness by construction beats a tie-break rule nobody will remember.
   */
  .refine(
    (envelope) => {
      const seen = new Set<string>();
      for (const block of envelope.blocks) {
        const ids = [
          block.id,
          ...(block.type === 'card_grid' ? block.cards.map((card) => card.id) : []),
        ];
        for (const id of ids) {
          if (id === undefined) {
            continue;
          }
          if (seen.has(id)) {
            return false;
          }
          seen.add(id);
        }
      }
      return true;
    },
    { message: 'block ids must be unique within a message' },
  )
  .refine(
    (envelope) => {
      // Measured in BYTES, not characters: an emoji-heavy card is four times
      // its length. `Buffer` is not available in the browser, and this schema
      // is a server-side validator, so `TextEncoder` is the portable choice.
      try {
        return new TextEncoder().encode(JSON.stringify(envelope)).length <= MAX_ENVELOPE_BYTES;
      } catch {
        // A structure JSON.stringify refuses (a cycle) is not a valid envelope.
        return false;
      }
    },
    { message: `blocks envelope must serialise to at most ${MAX_ENVELOPE_BYTES} bytes` },
  )
  /*
   * A table row may not carry more cells than the table has columns.
   *
   * This lives here rather than on the `table` member because a
   * `z.discriminatedUnion` member must be a plain object: a `.refine()` on it
   * produces a `ZodEffects`, zod then cannot read `type` as the
   * discriminator, and constructing the union throws at module load — which
   * is how this was found.
   *
   * A SHORT row is deliberately fine and renders blanks. An author building a
   * comparison out of a catalogue will have gaps, and refusing the whole
   * table for one missing cell just makes them send a worse one with "—" in
   * it. A long row is a mistake, not a gap.
   */
  .refine(
    (envelope) =>
      envelope.blocks.every((block) =>
        block.type !== 'table'
          ? true
          : block.rows.every((row) => row.cells.length <= block.columns.length),
      ),
    { message: 'a table row cannot carry more cells than the table has columns' },
  );

export type WidgetBlock = z.infer<typeof widgetBlockSchema>;
export type WidgetCard = z.infer<typeof cardBodySchema>;
/*
 * Exported so the renderers import the shape rather than retyping it. Three
 * hand-written copies of `{ label, value, inStock }` is how one of them comes
 * to spell it `available` and nothing notices.
 */
export type {
  WidgetCardStock,
  WidgetCardVariant,
  WidgetGridMore,
  WidgetOrderStatusStep,
} from './block-values.js';
export type { WidgetCardModel, WidgetGridPlacement, WidgetPlaceBlock } from './spatial-schema.js';
export type WidgetBlocksEnvelope = z.infer<typeof widgetBlocksEnvelopeSchema>;

/**
 * Parse without throwing.
 *
 * An old widget WILL meet messages from a newer server, so an unrecognised
 * `v` is an expected condition, not an exception: the caller falls back to the
 * message's plain-text `body`. Returning `null` rather than a partial tree is
 * deliberate — half a card is worse than a sentence.
 */
export function parseBlocksEnvelope(raw: unknown): WidgetBlocksEnvelope | null {
  const parsed = widgetBlocksEnvelopeSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
