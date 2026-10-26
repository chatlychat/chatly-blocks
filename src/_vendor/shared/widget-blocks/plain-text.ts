/**
 * A block message's plain-text rendition.
 *
 * `messages.body` is NOT NULL and stays required for block messages, because
 * `body` is what feeds Postgres FTS, push-notification previews, the email
 * transcript's text part, the model's own context on the next turn, and any
 * channel that cannot render blocks at all (SMS, WhatsApp text).
 *
 * ONE function, used by the API, the worker and the widget, so those three
 * cannot disagree about what a card "said".
 */
import { moneyToPlainText } from './money.js';
import { readCardBadges } from './read-envelope.js';
import { type WidgetBlocksEnvelope, type WidgetCard } from './schema.js';

function cardToLines(card: WidgetCard): string[] {
  const lines = [card.title];
  if (card.subtitle !== undefined) {
    lines.push(card.subtitle);
  }
  /*
   * The badges — and this was an OMISSION rather than a decision.
   *
   * This function has emitted the title, subtitle, price, stock, variants,
   * fields and action labels since it was written and silently skipped
   * `badge`. Every other thing this file leaves out carries a stated reason:
   * `status` is a spinner, a media URL is noise, a reaction pair is chrome
   * (below). This one carried none — so "Final sale" and "Backordered" were
   * lost to Postgres FTS, to the push preview, to the email transcript's text
   * part, to SMS and WhatsApp, and to the model reading the thread as context
   * on the next turn. Irrecoverably, for every row already stored.
   *
   * `readCardBadges` and not a local collapse: `badge` accepts a bare string,
   * an object with a tone, or an array of either, and the renderers all read
   * it through that one function. A text spine that spelled the union its own
   * way would be the drift this file exists to prevent, one layer down.
   *
   * ONE line for the set, named `Badge:` after the field that holds it — the
   * `Stock:` and `Options:` idiom — and placed in the card's own visual
   * order, which puts it in the heading above the price.
   *
   * The TONE is emitted only when it is NOT `neutral`, and that is not
   * thrift. A tone carries meaning rather than colour, so the model reading
   * this next turn needs it: "Great price" and "Above typical" are both
   * badges and they say opposite things. But the reader makes `neutral` the
   * tone of every bare string, which is every badge any integrator sends
   * today, so emitting it unconditionally would append the same ten dead
   * characters to every push preview we have. Same shape as the
   * `at === undefined` guard in the `order_status` arm and the
   * `inStock === false` test below: the marker appears when it says
   * something. The member is verbatim when it does, for the reason `stock`
   * is — no English baked into a stored string.
   */
  if (card.badge !== undefined) {
    const badges = readCardBadges(card.badge).map((badge) =>
      badge.tone === 'neutral' ? badge.text : `${badge.text} (${badge.tone})`,
    );
    if (badges.length > 0) {
      lines.push(`Badge: ${badges.join(', ')}`);
    }
  }
  /*
   * The price, and deliberately NOT in the visitor's locale.
   *
   * `body` is generated on the server and stored once, so any locale in it is
   * the server's — the defect `check-time-formatting.mjs` describes for a Next
   * server component, where a reader in Tokyo silently gets UTC. `USD 48.20`
   * is unambiguous to every reader of a transcript, to a push preview, to the
   * email copy, and to the model reading the thread as context next turn.
   * The widget formats the same number properly for the person looking at it.
   */
  if (card.price !== undefined) {
    lines.push(moneyToPlainText(card.price));
  }
  /*
   * Availability and the pickable options, in the author's own tokens.
   *
   * `Stock: out_of_stock` rather than "Out of stock", and that is deliberate
   * in both directions. This string is generated on the SERVER and stored, so
   * any English in it is OUR English for every reader — the argument
   * `moneyToPlainText` makes about locale, applied to copy. And `body` is
   * what the model reads as context on the next turn, where the enum member
   * is the thing to reason with: a bot told `out_of_stock` does not offer to
   * add it to a cart. Each surface that renders to a human writes its own
   * label, in its own language.
   */
  if (card.stock !== undefined) {
    lines.push(`Stock: ${card.stock}`);
  }
  if (card.variants !== undefined && card.variants.length > 0) {
    /*
     * ONE line for the whole set, not one per variant.
     *
     * Twenty shoe sizes as twenty lines would bury the card in a push preview
     * and in a transcript. They are named rather than counted for the reason
     * the `quick_replies` case below gives: the model needs to know what it
     * offered, or it re-asks.
     *
     * `inStock === false` and not `!inStock`: absent means the author did not
     * say, and marking an unknown as unavailable tells an agent reading the
     * transcript that the shopper was shown a greyed option when they were
     * not.
     */
    const options = card.variants.map((variant) =>
      variant.inStock === false ? `${variant.label} (unavailable)` : variant.label,
    );
    lines.push(`Options: ${options.join(', ')}`);
  }
  for (const field of card.fields ?? []) {
    lines.push(`${field.label}: ${field.value}`);
  }
  for (const action of card.actions ?? []) {
    lines.push(action.label);
  }
  /*
   * `reactions` is OMITTED, and here is the reason this file requires.
   *
   * Three things make it chrome rather than content. The pair is identical on
   * every card that offers it, so `like, dislike` in `messages.body` is the
   * same two words on every recommendation card we store — and every one of
   * them would then match an FTS search for "dislike". The schema calls the
   * toggle viewer-relative presentation it deliberately does not store, so
   * there is no per-conversation fact to record. And the quick-reply argument
   * below does not transfer: a chip's label is included because the visitor's
   * next message ("Under $50") reads as a non-sequitur without the question,
   * whereas a reaction delivers a SILENT postback — no visitor message is
   * written, so there is nothing left unexplained.
   */
  return lines;
}

/**
 * What a rendition with nothing in it says.
 *
 * `messages.body` is NOT NULL, so there has to be something. Exported because
 * `bodyAfterPatch` must recognise it: storing this over a real sentence was a
 * live defect, and a second file retyping the literal is how it comes back.
 */
export const NO_TEXT_CONTENT = '(no text content)';

export function blocksToPlainText(envelope: WidgetBlocksEnvelope): string {
  const lines: string[] = [];
  for (const block of envelope.blocks) {
    switch (block.type) {
      case 'text':
        lines.push(block.markdown);
        break;
      case 'media':
        // Alt text, not the URL: a push preview reading "https://cdn…" is noise.
        lines.push(block.alt);
        break;
      case 'fields':
        for (const item of block.items) {
          lines.push(`${item.label}: ${item.value}`);
        }
        break;
      case 'card':
        lines.push(...cardToLines(block));
        break;
      case 'card_grid':
        for (const card of block.cards) {
          lines.push(...cardToLines(card));
        }
        if (block.more !== undefined) {
          // The tile's label, like an action's: a push preview should say
          // what was offered, and "Show all 60" is what was offered.
          lines.push(block.more.label);
        }
        break;
      case 'actions':
        for (const action of block.actions) {
          lines.push(action.label);
        }
        break;
      case 'quick_replies':
        /*
         * The labels, like an `actions` block.
         *
         * Included rather than skipped because the model reading this thread
         * as context on the next turn needs to know what it offered: a
         * transcript that records "Under $50" as the visitor's reply with no
         * record of the question reads as a non-sequitur, and the agent
         * re-asks.
         */
        for (const option of block.options) {
          lines.push(option.label);
        }
        break;
      case 'order_status':
        /*
         * Included, where `status` below is not, and the difference is not a
         * near miss: a `status` block is OUR progress indicator — a spinner
         * that says "Thinking…" and then goes away — while this is the
         * substance of the answer to "where is my order". On SMS it is the
         * only thing the customer gets.
         *
         * `Shipped: done (2026-10-12T14:02:00+01:00)`. Three decisions in
         * that line:
         *   - `label: state`, the `${label}: ${value}` idiom every other arm
         *     of this switch uses;
         *   - the enum member verbatim, for the reason `cardToLines` gives
         *     about `stock` — no English copy baked into a stored string, and
         *     the exact token the model should reason with next turn;
         *   - the ISO timestamp verbatim, never `toLocaleString`. This runs
         *     on the server, so a locale here is the SERVER's for every
         *     reader — `check-time-formatting.mjs`'s whole subject. An ISO
         *     string with an offset is unambiguous to a human reading a
         *     transcript and to the model. Each renderer formats it for the
         *     person actually looking at it.
         */
        for (const step of block.steps) {
          const at = step.at === undefined ? '' : ` (${step.at})`;
          lines.push(`${step.label}: ${step.state}${at}`);
        }
        break;
      case 'table': {
        /*
         * ── ONE LINE PER ROW, under one line of headings ─────────────
         *
         * A 6x12 table is 72 cells, and one line per cell — `Dunk Low Price:
         * USD 120.00` — is 72 lines in a push preview, in an SMS, in the
         * email transcript and in the model's context window, for a block a
         * shopper reads in four. That is the argument `card.variants` settled
         * when it chose one line for twenty shoe sizes, and the answer here
         * is the same for the same reason.
         *
         * So: the column labels ONCE, on a line of their own, then one line
         * per attribute. rows+1 lines rather than rows x columns. The mapping
         * from a cell to its column is POSITIONAL, which is what a table is:
         * `Columns: A, B, C` followed by `Price: 1, 2, 3` can be read back by
         * a person and aligned by a model.
         *
         * `Columns:` is the field's own name, the `Stock:` idiom — this
         * string is generated on the server and stored, so any English in it
         * is OUR English for every reader, and a protocol token is the thing
         * the model should reason with. A blank heading (which the reader
         * produces for a column it could not read, rather than dropping the
         * column and shifting every row) stays blank here, because the
         * alignment is the whole point of the line.
         *
         * A column's IMAGE flattens to NOTHING, and that is not the `media`
         * rule with a different answer — it is the same rule. `media` prints
         * `alt` and not the URL because "https://cdn…" in a push preview is
         * noise; a table column has no alt text, only a label that is already
         * on the line above. There is nothing the heading does not say.
         *
         * Trailing empty cells are trimmed; interior ones are kept. A short
         * row renders blanks by design, and an interior blank is
         * load-bearing — `Weight: , , 290g` says the 290g belongs to the
         * third column — while a trailing one says nothing at all.
         */
        if (block.caption !== undefined) {
          lines.push(block.caption);
        }
        lines.push(`Columns: ${block.columns.map((column) => column.label).join(', ')}`);
        for (const row of block.rows) {
          const cells = [...row.cells];
          while (cells.length > 0 && cells[cells.length - 1] === '') {
            cells.pop();
          }
          // A row with nothing left is its own label: `Weight: ` with a
          // trailing space is a gap in a transcript, not a fact.
          lines.push(cells.length === 0 ? row.label : `${row.label}: ${cells.join(', ')}`);
        }
        break;
      }
      case 'place':
        /*
         * A destination, in words: `Place: Nike store, front door (Level 2,
         * by the escalator)`. Included for the reason `order_status` is — on
         * SMS, in the e-mail text part and in the model's next-turn context
         * this line is the whole block, and a transcript that omitted it
         * would record "I'll take you there" with no there.
         *
         * `ref` is OMITTED: it is the world's opaque id, meaningless to a
         * person and noise in a push preview, like a media URL.
         *
         * `card.model` and `card_grid.placement` are omitted too, and for a
         * stated reason rather than an oversight: they are spatial hints that
         * say nothing a reader of a transcript could use, and a model URL in
         * `messages.body` would be a link nobody can open. The card is its
         * title, price and options, exactly as before.
         */
        lines.push(
          block.detail === undefined
            ? `Place: ${block.label}`
            : `Place: ${block.label} (${block.detail})`,
        );
        break;
      case 'status':
        // Progress, not content. A transcript should not read "Thinking…".
        break;
      case 'divider':
        break;
    }
  }
  const text = lines.join('\n').trim();
  /*
   * A valid envelope must never produce an empty body: `messages.body` is NOT
   * NULL, and an empty string would also make the message invisible to search
   * and silent in a push preview. A divider-only message is legal and lands
   * here.
   */
  return text.length > 0 ? text : NO_TEXT_CONTENT;
}
