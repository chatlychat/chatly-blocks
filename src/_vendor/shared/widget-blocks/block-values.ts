/**
 * The VALUE objects a block shape is built from — a price, a variant, a stock
 * state, a label/value row, a grid's paging tile, a timeline milestone.
 *
 * A LEAF, like `card-fields.ts` next door: zod and the action vocabulary, and
 * nothing else. The seam is the one that file already named and this is the
 * same seam applied again — `schema.ts` holds the block SHAPES (the
 * discriminated union and the envelope) and the little objects inside them
 * live beside it. That rule is what keeps `schema.ts` readable as a list of
 * what a block IS, and it is the third time `schema.ts` has crossed the
 * 650-line ceiling and been split along it (`table-schema.ts`,
 * `card-fields.ts`, `spatial-schema.ts` were the first three).
 *
 * `cardBodySchema` deliberately did NOT come here. A `card` is a block shape
 * and it is the discriminator's own member — splitting it out would move a
 * block type away from the union that declares the other ten, which is the
 * one thing the two block-parity gates read `schema.ts` to find.
 *
 * Every cap here is RE-EXPORTED from `schema.ts`, so nothing that reads the
 * limits has to learn a second import — the arrangement `MAX_CARD_BADGES`
 * and `MAX_TABLE_COLUMNS` already use.
 */
import { z } from 'zod';

import { pagingActionSchema } from './actions.js';

/** Label/value rows on a card or a `fields` block. */
export const MAX_FIELDS_PER_BLOCK = 20;

/**
 * Purchasable variants offered on one card.
 *
 * Twenty, and the number comes from the two things that bound it. It renders
 * as a SELECT, so the geometry argument behind `MAX_QUICK_REPLIES` does not
 * apply — a dropdown costs one row whatever is in it. What does apply is that
 * a card is a summary: a list longer than this is a search box on a Tier 2
 * step, not a `<select>` a shopper scrolls. And it has to fit the real case
 * that motivated the field — a full US shoe size run, 4 to 13 in half sizes,
 * is nineteen entries.
 *
 * Same number as `MAX_FIELDS_PER_BLOCK` by coincidence of argument rather
 * than by sharing the constant: they bound different collections and one of
 * them will move.
 */
export const MAX_VARIANTS_PER_CARD = 20;

/**
 * Milestones on an `order_status` timeline.
 *
 * Eight, which is the canonical fulfilment run plus one: placed, paid,
 * packed, shipped, in transit, out for delivery, delivered, and one more for
 * a return or an exception.
 *
 * It is deliberately NOT enough for a carrier's per-scan log, which is
 * twenty-plus rows and belongs behind a `url` action on a tracking page. The
 * timeline renders as a vertical stack in a 380px panel, so a ninth row
 * pushes the message that explains it off the screen — the same argument as
 * `MAX_QUICK_REPLIES`, in the other axis.
 */
export const MAX_ORDER_STATUS_STEPS = 8;

export const fieldSchema = z
  .object({ label: z.string().min(1).max(80), value: z.string().min(1).max(400) })
  .strict();

/**
 * A price, in MINOR units.
 *
 * `amount` is an integer and the schema refuses anything else — not a
 * stylistic preference. A card author who sends `48.2` has sent a float, and
 * a cart total that survives one JSON round trip as `48.199999999999996` is
 * the defect this forbids at the boundary rather than hunts later. See
 * `money.ts` for why the divisor is not 100 and why the formatter is shared.
 *
 * `compareAt` is the was-price. It is NOT required to be above `amount` here:
 * a sale that ended leaves a row with the two equal, and refusing to store
 * the card at that moment would take the whole listing off the screen. The
 * renderers draw it only when it is genuinely higher, which is the right place
 * for a presentation rule.
 */
export const moneySchema = z
  .object({
    amount: z.number().int().min(0),
    currency: z
      .string()
      .length(3)
      .regex(/^[A-Z]{3}$/, 'Use an ISO 4217 code like USD'),
    compareAt: z.number().int().min(0).optional(),
  })
  .strict();

/**
 * One purchasable option on a card — a size, a colour, a plan tier.
 *
 * Every marketplace on this format hand-rolls these out of `fields` today,
 * which renders as a read-only `Size: US 10` row: the shopper cannot pick,
 * and nothing downstream knows the card had options at all. Typed, the widget
 * renders a `<select>` and the agent inbox can show what was offered.
 *
 * `label` is what the shopper reads and `value` is what a program receives,
 * exactly as on a quick reply and for the same reason — and the bounds are
 * that option's bounds, so one envelope has one vocabulary for the pair. It
 * is a separate declaration because it is a separate concept carrying a third
 * field; a chip is a prompt for the next turn, a variant is a thing to buy.
 *
 * `inStock` is OPTIONAL and tri-state on purpose: absent means the author did
 * not say, which is not the same as `false`. A renderer greys out a `false`
 * and leaves an absent one alone, because treating "unknown" as "sold out"
 * takes a buyable option off the screen.
 */
export const variantSchema = z
  .object({
    label: z.string().min(1).max(40),
    value: z.string().min(1).max(400),
    inStock: z.boolean().optional(),
  })
  .strict();

/**
 * Whether the thing on the card can be bought right now.
 *
 * Three states and no number. A count ("4 left") is a figure that is wrong
 * the moment it is stored — a block message is persisted and an agent reads
 * it back days later — whereas `low` is a claim that stays true for about as
 * long as the conversation does. An author who wants the count has `fields`.
 *
 * No cap needed: an enum is its own bound, which is the whole reason this is
 * not a free string.
 */
export const stockSchema = z.enum(['in_stock', 'low', 'out_of_stock']);

/**
 * The trailing "show me more" tile on a grid.
 *
 * The grid is capped at `MAX_CARDS_PER_GRID` and there is no paging, so a
 * catalogue of sixty listings has nowhere to go. This is the affordance for
 * the next page, and it is ONE object rather than a cursor because paging a
 * stored message is not what happens: the tile asks for the next page and the
 * bot sends a NEW grid, which is also why nothing here is a page token.
 *
 * `action` is `pagingActionSchema` — the two kinds that can page, built from
 * the SAME member declarations as `widgetActionSchema`, so a `url` tile's
 * field is `href` and not `url`, a mistake this repo has already shipped in
 * its own documentation:
 *
 *   - `postback` — ask the bot for the next page; it answers in the thread.
 *   - `url` — the full catalogue on the merchant's own site.
 *
 * The other three are refused rather than merely discouraged, and `actions.ts`
 * records why each one would be a tile that silently does nothing. It is a
 * discriminated union and not `widgetActionSchema.refine(…)` because a refine
 * narrows only the OUTPUT type; see the note above `urlActionSchema` for the
 * three TS1360 errors that cost.
 *
 * Note for a renderer: this action is not inside any card's `actions` array,
 * so `positionalActionId` cannot name it — an author who wants `reportAction`
 * to work on the tile sets `action.id`.
 */
export const gridMoreSchema = z
  .object({
    // Same bound as an action's own label, because this renders as one.
    label: z.string().min(1).max(40),
    action: pagingActionSchema,
  })
  .strict();

/**
 * One milestone on an `order_status` timeline.
 *
 * `at` is OPTIONAL, and that is the whole shape of the feature: a `pending`
 * step has not happened, so requiring a timestamp would make an author invent
 * one for the future. A `pending` step with an `at` is legal and meaningful —
 * an estimated delivery date — which is why this is not refused by a
 * cross-field rule.
 *
 * The spelling is `z.string().datetime({ offset: true })`, matching
 * `issuedAt` in `@livechat/shared/widget-canvas` rather than the bare
 * `.datetime()` the served API schemas use. Both are deliberate and the
 * difference is who writes the value: an API response is ours and always
 * UTC-`Z`, while this comes out of a merchant's order system, which emits
 * `2026-10-12T14:02:00+01:00` and would otherwise get a 400 on a correct
 * timestamp.
 *
 * `state` is required. It could default to `pending`, but then three
 * renderers would each be guessing at a block the author left half-written;
 * the READ path coerces an unrecognised one instead, which is the place that
 * has to tolerate a newer server.
 */
export const orderStatusStepSchema = z
  .object({
    // `fieldSchema.label`'s bound: "Out for delivery with DHL" fits in 80.
    label: z.string().min(1).max(80),
    at: z.string().datetime({ offset: true }).optional(),
    state: z.enum(['done', 'current', 'pending']),
  })
  .strict();

export type WidgetCardVariant = z.infer<typeof variantSchema>;
export type WidgetCardStock = z.infer<typeof stockSchema>;
export type WidgetGridMore = z.infer<typeof gridMoreSchema>;
export type WidgetOrderStatusStep = z.infer<typeof orderStatusStepSchema>;
