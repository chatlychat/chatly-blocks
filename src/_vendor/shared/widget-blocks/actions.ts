/**
 * What a block's button may do.
 *
 * Six kinds and deliberately no `custom`. A `custom` kind carrying a code
 * string is arbitrary execution with extra steps, and this repo has already
 * shipped XSS twice through raw-HTML sinks.
 *
 * `host_event` is the native-integration mechanism: it delivers a NAME and
 * JSON to the host page over the SDK, and the host decides what to do. The
 * host participates in behaviour, never in rendering — which is why the same
 * card still renders for an agent on takeover, where the event has no
 * listener.
 *
 * `step` is the fifth, and it is the one kind whose work happens on OUR
 * server: it asks the workspace's canvas endpoint for an interactive step and
 * posts the answer into the thread. A card could already carry a `postback`
 * that a bot turns into a step, but that round trip goes through a model and
 * is therefore neither certain nor fast — and a buy flow's confirm step has to
 * be both.
 */
import { z } from 'zod';

import {
  HOST_EVENT_NAME_RE,
  NAVIGATE_PATH_MAX,
  isSafeActionHref,
  isSafeNavigatePath,
} from './href-guard.js';
import {
  ICON_VALUE_REFUSAL,
  WIDGET_ICON_MAX_LENGTH,
  isSafeIconOverride,
  isUsableIconValue,
} from '../widget-config/icons.js';

const label = z.string().min(1).max(40);
const style = z.enum(['primary', 'secondary', 'danger']).optional();

/**
 * A glyph on an action's button. Four forms, the same four everything else
 * in this product accepts: a built-in name, an image URL, inline `<svg …>`
 * markup, or one symbol such as an emoji.
 *
 * ── `label` stays REQUIRED, and that is the point of the feature ────────
 *
 * The ask was for "icon-only actions (`icon` + `label` for a11y)", and the
 * second half is the whole of it: an icon-only button with no accessible
 * name is announced as "button". So an icon does not REPLACE the label, it
 * replaces the label's *rendering* — the text becomes the button's
 * `aria-label` and `title`, which is also what a sighted visitor gets on
 * hover. There is deliberately no way to ship a nameless button.
 *
 * ── Why the same predicates as `theme.icons` ────────────────────────────
 *
 * `isUsableIconValue` is what stops `icon: 'paperclip'` drawing the WORD
 * "paperclip" — `planIconValue` renders anything it cannot recognise as
 * text, and a mistake drawn at 18px looks deliberate. `isSafeIconOverride`
 * is the other half: this value reaches `dangerouslySetInnerHTML` on the
 * inline-SVG branch, and it arrives from whoever can write a block.
 */
const actionIcon = z
  .string()
  .min(1)
  .max(WIDGET_ICON_MAX_LENGTH)
  .refine(isUsableIconValue, { message: ICON_VALUE_REFUSAL })
  .refine(isSafeIconOverride, {
    message: 'an action icon may not contain scripts, event handlers or javascript: URLs',
  })
  .optional();

/**
 * An action's own name, so a RESULT can be reported back against it.
 *
 * Optional, because every card written before `Chatly('reportAction')`
 * existed has no ids and must keep working. Where it is absent the widget
 * emits a POSITIONAL id instead (`b2.c3.a0` — block, card, action), which is
 * stable for as long as the envelope is, and that is the whole life of the
 * click it describes. An author who wants an id that survives a block patch
 * sets one.
 *
 * Same character class as `card.id` so one envelope has one id vocabulary.
 */
const actionId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._:-]+$/);

/**
 * The step a `step` action asks for.
 *
 * Matches `canvasId` in `@livechat/shared/widget-canvas` — the integrator's
 * own name for the step, which they receive back in the callback and switch
 * on. Declared here rather than imported because `widget-canvas/schema.ts`
 * imports THIS file's block schema, and the cycle would be real rather than
 * type-only.
 */
const canvasIdRef = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._:-]+$/);

/**
 * The two action kinds that can PAGE, named so they can be reused.
 *
 * `gridMoreSchema` needs a union of exactly these two, and the obvious way
 * to write that — `widgetActionSchema.refine(…)` — is wrong in a way nothing
 * in this package notices. A `refine` narrows the OUTPUT type and leaves the
 * INPUT type the full five-member union, so a `satisfies
 * z.ZodType<T>` assertion over anything containing a grid fails with
 * "two different types with this name exist": `apps/api`'s canvas response
 * schemas did, with three TS1360 errors that named the whole block union
 * rather than the one field at fault.
 *
 * So the two members are declared once, here, and composed into both unions.
 * That is the thing the old comment on `gridMoreSchema` was reaching for when
 * it said "not a second declaration of the concept" — it is now true of the
 * types as well as of the fields.
 */
const urlActionSchema = z
  .object({
    kind: z.literal('url'),
    label,
    href: z
      .string()
      .refine(isSafeActionHref, 'Use an https, mailto or tel URL with no control characters'),
    style,
    icon: actionIcon,
    /**
     * Open in the SAME tab, when the link is on the page the widget is in.
     *
     * ── What asked for this ────────────────────────────────────────────────
     *
     * A `url` action has always opened a new tab. For a link back to the
     * integrator's own site — the page the widget is embedded on — that
     * splits the shopper across two tabs with the conversation left behind in
     * one of them. The workaround was routing their own paths through a
     * `host_event` their page listened for, which works on their pages and
     * does nothing in the agent inbox, the e-mail transcript, or any surface
     * with no listener.
     *
     * ── Honoured only on the embedding page's own origin ───────────────────
     *
     * `'self'` is a REQUEST, not a guarantee, and the renderer decides. The
     * widget honours it when the href's origin matches the page it is running
     * in, and opens a new tab otherwise.
     *
     * That rule is the whole safety argument. A card is author content: a bot
     * — or anything that can write a block — could otherwise navigate the
     * host page away from itself to any origin it liked, which turns a chat
     * message into a redirect primitive on somebody else's site. Keeping
     * cross-origin links in a new tab means the worst a card can do is what a
     * card has always been able to do.
     *
     * ── And it is IGNORED where it is meaningless ─────────────────────────
     *
     * The agent inbox, the agent mobile app and the e-mail transcript have no
     * "embedding page", so there is no origin to match and `target` has no
     * meaning. They keep opening a new tab. That is deliberate: an agent
     * reading a transcript must not have their inbox navigated away by a link
     * inside a message they are looking at.
     *
     * Absent means `'blank'`. There is no `'blank'` member to write, because
     * a field whose only non-default value is the interesting one reads
     * better as present-or-absent, and every stored card predates this.
     */
    target: z.literal('self').optional(),
  })
  .strict();
const postbackActionSchema = z
  .object({
    kind: z.literal('postback'),
    label,
    id: actionId.optional(),
    value: z.string().min(1).max(400),
    /**
     * Structured data the bot receives alongside `value`.
     *
     * `value` is the sentence; this is the machine-readable part. A filter
     * chip reading "Under $50" wants `{ max_cents: 5000 }`, and asking a
     * model to recover that from the label is how a shopping agent lists
     * the wrong products.
     */
    payload: z.record(z.string(), z.unknown()).optional(),
    /**
     * Deliver to the bot WITHOUT a visitor bubble.
     *
     * This field used to be refused. The comment that stood here said
     * there was "deliberately NO `echo` flag", because hiding a turn needs
     * a server-side hidden-message concept that did not exist — and that a
     * schema field nothing honours is the defect
     * `widget-config/appearance.ts` warns about. It said it "comes back
     * when the server can hide a turn". The server can: migration 0604
     * adds `messages.hidden_from_contact`, the widget's own list and
     * realtime paths filter on it, and the agent inbox renders it as a
     * quiet line so a human taking over can still see what the shopper
     * pressed.
     *
     * It is NOT a private channel. The message is stored, it is in the
     * transcript, and the agent sees it — hidden means hidden from the
     * THREAD the visitor is reading, so a filter chip does not fill their
     * panel with "under_50". Anything that must not be visible to a human
     * reading the conversation does not belong in a postback.
     */
    silent: z.boolean().optional(),
    style,
    icon: actionIcon,
  })
  .strict();

/**
 * Every action a card, a quick reply or a canvas block may carry.
 *
 * `url` and `postback` come from the consts above so that
 * `pagingActionSchema` is the SAME declaration narrowed, not a copy.
 */
/**
 * Pulled out of the union below so `cardTapActionSchema` can NARROW the same
 * declaration rather than restating it — the rule `pagingActionSchema` already
 * follows. Two copies of a member is two places a field gets added to one of.
 */
const hostEventActionSchema = z
  .object({
    kind: z.literal('host_event'),
    label,
    id: actionId.optional(),
    event: z.string().regex(HOST_EVENT_NAME_RE, 'Use a dotted identifier like cart.add'),
    // Size-capped by the envelope's overall byte cap at the API boundary.
    data: z.record(z.string(), z.unknown()).optional(),
    style,
    icon: actionIcon,
  })
  .strict();

/** Same reason as `hostEventActionSchema` above. */
const stepActionSchema = z
  .object({
    kind: z.literal('step'),
    label,
    id: actionId.optional(),
    canvasId: canvasIdRef,
    params: z.record(z.string(), z.unknown()).optional(),
    style,
    icon: actionIcon,
  })
  .strict();

/**
 * `navigate` — go to a page of the integrator's OWN site, by path.
 *
 * A `url` action cannot say "the pricing page" without the integrator
 * hard-coding their origin into every card a bot writes, and `target: 'self'`
 * only helps on the page the link happens to be on. This carries a PATH
 * (`/pricing?plan=pro`), validated by `isSafeNavigatePath` so that
 * `origin + path` cannot leave the origin, and the surface decides how to go:
 *
 *  - the visitor widget and the React Native client hand it to the host's
 *    `navigate` hook (an SPA router call, no page reload), and with no hook
 *    open `origin + path`;
 *  - the agent inbox and the e-mail transcript show the full URL, because they
 *    have no page of their own and an agent must be able to read where the
 *    visitor was sent.
 *
 * The origin is the channel's first concrete `allowedOrigins` entry
 * (`resolveSiteOrigin`); see ADR 0082.
 */
const navigateActionSchema = z
  .object({
    kind: z.literal('navigate'),
    label,
    id: actionId.optional(),
    path: z
      .string()
      .max(NAVIGATE_PATH_MAX)
      .refine(
        isSafeNavigatePath,
        'Use a path that starts with a single /, with no host, //, backslash, control character or .. segment',
      ),
    style,
    icon: actionIcon,
  })
  .strict();

export const widgetActionSchema = z.discriminatedUnion('kind', [
  urlActionSchema,
  postbackActionSchema,
  hostEventActionSchema,
  stepActionSchema,
  navigateActionSchema,
  z
    .object({
      kind: z.literal('copy'),
      label,
      text: z.string().min(1).max(2000),
      style,
      icon: actionIcon,
    })
    .strict(),
]);

export type WidgetAction = z.infer<typeof widgetActionSchema>;

/**
 * The narrowed union a grid's "show me more" tile takes.
 *
 * A real `z.discriminatedUnion` rather than a refinement, so the input type
 * narrows with the output one — see the note above `urlActionSchema`. The
 * refusal message is also better for it: zod answers "Invalid discriminator
 * value. Expected 'url' | 'postback'", which NAMES the two that work, where
 * the refine said only that the value was wrong.
 *
 * Why these two and not the other three: `copy` puts a string on the
 * clipboard and shows no further cards, `host_event` hands the press to the
 * host page, which cannot add cards to a conversation, and `step` opens a
 * canvas, which is a form and not a page. Each would be a tile that silently
 * does nothing.
 */
export const pagingActionSchema = z.discriminatedUnion('kind', [
  urlActionSchema,
  postbackActionSchema,
  navigateActionSchema,
]);

/** A `url`, `postback` or `navigate` action — what a grid's overflow tile may carry. */
export type PagingAction = z.infer<typeof pagingActionSchema>;

/**
 * What a CARD's image and title may fire when tapped.
 *
 * `url`, `host_event`, `step` and `navigate`: the four kinds that mean "go somewhere" or
 * "do the thing this card is about". The same declarations the full union
 * uses, narrowed — not restated.
 *
 * `postback` is deliberately absent. A silent message sent by tapping a photo
 * is indistinguishable from a mis-tap, and it would be the only control in
 * the product whose entire feedback is nothing happening. The one
 * postback-shaped thing a card already offers, the reaction pair, has its own
 * visible, labelled buttons.
 *
 * `copy` is absent for a plainer reason: tapping a product photo to put text
 * on the clipboard is not a thing anybody expects.
 */
export const cardTapActionSchema = z.discriminatedUnion('kind', [
  urlActionSchema,
  hostEventActionSchema,
  stepActionSchema,
  navigateActionSchema,
]);

/** What `card.action` carries. */
export type CardTapAction = z.infer<typeof cardTapActionSchema>;

/*
 * Re-exported, not declared here: the WIDGET computes this id and may not
 * import a module that pulls zod. See `action-id.ts`.
 */
export { positionalActionId } from './action-id.js';
