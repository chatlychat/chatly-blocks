/**
 * A card's badge and reaction VALUE schemas. A LEAF — zod and nothing else.
 *
 * Split out of `schema.ts` when that file crossed the 650-line ceiling. They
 * belong together: both are small value objects a card decorates itself with,
 * neither reaches another schema, and keeping them here means `schema.ts`
 * holds block SHAPES rather than the little unions inside them.
 *
 * `MAX_CARD_BADGES` stays exported from `schema.ts` with the other caps, so
 * nothing that reads the limits has to learn a second import.
 */
import { z } from 'zod';

/**
 * At most two badges.
 *
 * Here rather than with the other caps in `schema.ts`, because this is the
 * only file that enforces it and a constant importable from the schema would
 * be a cycle: `schema.ts` imports this leaf. `schema.ts` RE-EXPORTS it, so
 * every existing importer of the caps is unchanged.
 */
export const MAX_CARD_BADGES = 2;

/**
 * Actions a card shows WITHOUT opening anything, and the total it may carry.
 *
 * Five visible is what the panel fits: `widget-commerce.css` wraps them in a
 * 380px column and a sixth button starts a third row. The eight behind the
 * overflow are the integrator's ask, and the number is theirs — a shopping
 * card legitimately wants Buy, Offer, Save, Cart, View and "is this a good
 * price?", which is already six.
 *
 * ── Why a total of thirteen is allowed on a thing called "not a library" ──
 *
 * This schema's header argues that a card is one shape and not a vertical
 * library, and thirteen actions tests that. The reconciliation is that only
 * five are ever on screen: the overflow is one button, so the card's height
 * does not grow with the eighth action the way a `fields` list grows with
 * its twentieth row. An author who puts thirteen actions on a card has made
 * a menu, which is a legitimate thing to want and costs the panel nothing.
 */
export const MAX_CARD_ACTIONS_VISIBLE = 5;
export const MAX_CARD_ACTIONS = 13;

/**
 * What a card's badge may be, and why it is a union.
 *
 * It was `z.string()`, and every stored row and every integrator today sends
 * one. A tone needs an object, so the field accepts BOTH and the reader
 * normalises: a plain string is a `neutral` badge. Replacing the string
 * outright would have refused every card already in a transcript, and
 * introducing a second `badges` key beside it would leave two spellings of
 * one idea in the protocol for ever.
 *
 * `tone` carries meaning, not colour. "Great price" and "Above typical" are
 * both badges and they say opposite things, which is the one case a single
 * pill colour cannot express. The four members map to the theme's existing
 * `successColor` / `warningColor` / `dangerColor` plus the default surface,
 * so a workspace that themed its widget already themed these.
 */
export const cardBadgeSchema = z
  .object({
    text: z.string().min(1).max(40),
    tone: z.enum(['success', 'warning', 'danger', 'neutral']).optional(),
  })
  .strict();

/**
 * One badge, two badges, or the legacy string. See `cardBadgeSchema`.
 *
 * The array form is capped at `MAX_CARD_BADGES`. A bare string stays legal
 * for ever: it is what is in the database.
 */
export const cardBadgeFieldSchema = z.union([
  z.string().min(1).max(40),
  cardBadgeSchema,
  z
    .array(z.union([z.string().min(1).max(40), cardBadgeSchema]))
    .min(1)
    .max(MAX_CARD_BADGES),
]);

/**
 * A reaction a card offers. `like` and `dislike` are the pair the loop needs.
 *
 * An enum rather than free text because the value travels to a bot, which
 * switches on it — and because a bot author reading `reactions` must be able
 * to know the whole vocabulary without reading a customer's card.
 */
export const cardReactionSchema = z.enum(['like', 'dislike']);
