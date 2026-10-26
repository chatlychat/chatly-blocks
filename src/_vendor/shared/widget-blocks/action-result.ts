/**
 * What the HOST PAGE says happened after it handled a `host_event`.
 *
 * ── The gap this closes ─────────────────────────────────────────────────
 *
 * `host_event` has always been one-way. A card button fires `cart.add` into
 * the customer's own page, the page adds the item with the buyer's own session
 * — their cart, their Stripe 3-D Secure — and then nothing. The thread shows
 * a button that was pressed and no outcome; the bot that sent the card has no
 * idea whether the add succeeded, so its next turn is a guess. A shopper who
 * pressed "Add to cart" and reads "Would you like to add it to your cart?"
 * concludes the chat is broken, and they are not wrong.
 *
 * So the host reports back, and the report does two things that are
 * deliberately NOT the same thing:
 *
 *  1. It appends a visible line under the card the button belongs to, so the
 *     shopper sees "Added to your cart".
 *  2. It is delivered to the owning bot as an `action_result`, so the next
 *     turn knows.
 *
 * ── Why the host is trusted for this and only this ──────────────────────
 *
 * The host page is the customer's own code, so its word on what its own cart
 * did is the only word there is. What it CANNOT do here is matter: the result
 * carries no price, no entitlement and no identity, it names a message the
 * visitor's session already owns, and `text` is rendered as TEXT — a `text`
 * block's markdown is drawn as a string by every renderer in this repo, not
 * parsed into HTML (`blocks/render.tsx`'s own note says why). A hostile host
 * page can already draw anything it likes on its own page; it gains nothing
 * by writing a sentence into the chat panel it is hosting.
 *
 * `data` is passed to the bot verbatim and is NEVER rendered. An order id, a
 * charge id, a reason code — the bot's business, not the visitor's screen.
 */
import { z } from 'zod';

import { widgetBlockSchema } from './schema.js';

/**
 * Longest result line.
 *
 * Shorter than a `text` block's 4,000 because this is a receipt under a card,
 * not a paragraph. A host that needs more sends `blocks`.
 */
export const MAX_ACTION_RESULT_TEXT = 400;

/** How many blocks a host may append as the result of one action. */
export const MAX_ACTION_RESULT_BLOCKS = 4;

/**
 * `done` or `failed`, and nothing in between.
 *
 * No `pending`. The host calls this when it knows; a third state would be a
 * spinner the host has to remember to resolve, and a spinner nobody resolves
 * is the worst of the three outcomes. A host that wants to show progress
 * sends a `status` block through its own bot.
 */
export const actionResultStatusSchema = z.enum(['done', 'failed']);

export type ActionResultStatus = z.infer<typeof actionResultStatusSchema>;

/**
 * The id a result is reported against.
 *
 * Either the action's own `id` or the positional fallback the widget emitted
 * (`positionalActionId` in `actions.ts`). The charset admits both, and the
 * server does not resolve it against the stored envelope on purpose: a block
 * patch between the click and the report would make a valid result
 * unreportable, and the id's job here is to identify the result to the BOT,
 * not to locate a button.
 */
const reportedActionId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const actionResultInputSchema = z
  .object({
    messageId: z.string().min(1).max(64),
    actionId: reportedActionId,
    status: actionResultStatusSchema,
    /** The line the visitor reads. Omitted means nothing is appended. */
    text: z.string().trim().min(1).max(MAX_ACTION_RESULT_TEXT).optional(),
    /**
     * Blocks to append instead of `text`.
     *
     * An envelope, not a bare array, so it is the same shape a message
     * carries and goes through the same validator — a host that has already
     * built blocks for its own agent does not need a second format.
     */
    blocks: z
      .object({
        v: z.literal(1),
        blocks: z.array(widgetBlockSchema).min(1).max(MAX_ACTION_RESULT_BLOCKS),
      })
      .strict()
      .optional(),
    /** Opaque to us, delivered to the bot, never rendered. */
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type ActionResultInput = z.infer<typeof actionResultInputSchema>;

/**
 * The block id a result occupies on the card's message.
 *
 * Derived from the action id so a second report for the same action REPLACES
 * the first rather than stacking. That is what makes the call idempotent
 * without an `Idempotency-Key` doing the work: a host whose retry logic
 * reports `failed` and then `done` leaves one line saying `done`, which is
 * the truth. It is also why a result cannot be used to grow a message without
 * bound — one block per action, and a card carries at most five.
 */
export function actionResultBlockId(actionId: string): string {
  return `result:${actionId}`;
}

/**
 * What the owning bot receives.
 *
 * `type` is first and is a literal, because this travels in
 * `messages.metadata` beside whatever else a message carries and a consumer
 * switches on it. The spelling is `action_result` — the same snake_case the
 * realtime envelope's own `type` field uses, so a BYO agent reading
 * `message.created` sees one convention rather than two.
 */
export interface DeliveredActionResult {
  readonly type: 'action_result';
  readonly messageId: string;
  readonly actionId: string;
  readonly status: ActionResultStatus;
  readonly data: Record<string, unknown>;
}

/**
 * The one key under `messages.metadata` an action result lives at.
 *
 * ── This comment used to claim three readers. There are none. ────────────
 *
 * It said "three places read it — the API writes it, the worker's transcript
 * builder recognises it, and the outbound webhook's consumer documentation
 * names it". Checked 2026-10-12: the only occurrence of this constant or of
 * `.actionResult` anywhere outside a spec is the WRITER, in
 * `apps/api/src/modules/widget/widget-action-result.service.ts`. The worker's
 * transcript builder does not recognise it. No consumer documentation named
 * it.
 *
 * That mattered beyond tidiness: the false comment nearly got Chatly's own
 * autonomous agent documented as seeing the structured result of a host
 * action. It does not.
 *
 * ── What this key actually reaches, which is the real finding ────────────
 *
 * Written here, and readable only by surfaces that expose `messages.metadata`:
 * the `message.created` webhook envelope and the dedicated `message.action`
 * event. It is NOT readable from either documented bot surface — the external
 * agent push payload has no `metadata` key at all
 * (`packages/shared/src/external-agents/index.ts`), and
 * `GET /v1/bot/conversations/{id}/messages` selects five columns which do not
 * include it.
 *
 * So a card author can set an action's `payload`, get a 2xx, and their bot
 * never sees it, with nothing erroring anywhere. Written-and-never-read on the
 * paths that most want it. Keep the constant — one spelling is still better
 * than four — but do not add a reader on faith that one exists.
 */
export const ACTION_RESULT_METADATA_KEY = 'actionResult';

export function deliveredActionResult(input: ActionResultInput): DeliveredActionResult {
  return {
    type: 'action_result',
    messageId: input.messageId,
    actionId: input.actionId,
    status: input.status,
    data: input.data ?? {},
  };
}
