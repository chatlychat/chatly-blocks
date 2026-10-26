/**
 * The card's feedback pair, normalised. A LEAF — imports nothing.
 *
 * `reactions` is what the card OFFERS and `reaction` is what it is SET to,
 * and the two rules only make sense together, which is why they live in one
 * function rather than beside each other in `readCard`. The full argument for
 * the fields themselves is on the schema; this file holds only what the
 * reader has to do about them.
 *
 * Mutates in place, like the rest of `readCard`'s normalisation: the card bag
 * is already a fresh copy by the time it gets here.
 */

/** A card bag mid-normalisation. Deliberately not `Bag` — this file imports nothing. */
type CardBag = Record<string, unknown>;

export function normaliseCardFeedback(card: CardBag): void {
  /*
   * The reaction pair, narrowed to the two members and DEDUPED.
   *
   * `['like','like']` is accepted by the write schema — an enum of two with
   * `.max(2)` cannot say "distinct" — and draws two identical thumbs, or
   * worse: a renderer keying its list on the reaction value hands preact a
   * duplicate key, which drops one with no error. One rule here rather than
   * four renderers each remembering.
   *
   * An unrecognised member is DROPPED, not coerced: it reaches a glyph and
   * the payload of a postback a bot switches on, and unlike a timeline step
   * there is no label inside it worth keeping — the `stock` rule.
   */
  if (card['reactions'] !== undefined) {
    const reactions = Array.isArray(card['reactions'])
      ? card['reactions'].filter(
          (r, i, all) => (r === 'like' || r === 'dislike') && all.indexOf(r) === i,
        )
      : [];
    if (reactions.length === 0) {
      delete card['reactions'];
    } else {
      card['reactions'] = reactions;
    }
  }
  /*
   * The chosen thumb is dropped unless the card OFFERS it — a pressed thumb
   * with no control behind it is one the visitor cannot un-press, and
   * promoting it into `reactions` instead would let an author add a control
   * by accident. AFTER the filter above, so a value naming a member that
   * filter just dropped goes with it. Full reasoning on the schema field.
   */
  if (card['reaction'] !== undefined) {
    const offered = card['reactions'];
    const chosen = card['reaction'];
    const usable =
      Array.isArray(offered) &&
      (chosen === 'like' || chosen === 'dislike') &&
      offered.includes(chosen);
    if (!usable) {
      delete card['reaction'];
    }
  }
}
