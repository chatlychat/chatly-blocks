/**
 * A card's TAP action, narrowed. A LEAF.
 *
 * Its own file because `read-envelope.ts` crossed the 650-line ceiling when
 * this landed, and the rule is self-contained: it takes a parsed action and
 * answers whether a card's image may be wrapped in it.
 *
 * It takes `readAction` as an ARGUMENT rather than importing it, which keeps
 * this a leaf and avoids a cycle — `read-envelope.ts` owns the action parser
 * and would otherwise have to be imported back.
 */
import type { WidgetAction } from './actions.js';

/**
 * A card's TAP action — `card.action`, fired by its image or title.
 *
 * `readAction` and then a kind check, rather than its own parser: the members
 * are the same declarations the schema narrows, so parsing them twice is two
 * places a field gets added to one of.
 *
 * `postback` and `copy` are refused HERE as well as by the write schema,
 * because a stored card predating this field could carry anything and this
 * value reaches a control the whole card's image is wrapped in. A card whose
 * photo silently sends a message on tap is the one outcome worth refusing at
 * the sink as well as the boundary.
 *
 * Dropped, not downgraded: a card with an unusable `action` renders as the
 * plain card it was before the field existed, which is the behaviour every
 * stored row already has.
 */
export function readCardTapAction(
  raw: unknown,
  readAction: (r: unknown) => WidgetAction | null,
): WidgetAction | null {
  const action = readAction(raw);
  if (action === null) {
    return null;
  }
  return action.kind === 'url' ||
    action.kind === 'host_event' ||
    action.kind === 'step' ||
    action.kind === 'navigate'
    ? action
    : null;
}
