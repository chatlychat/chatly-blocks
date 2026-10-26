/**
 * Money on a card, and the ONE place it is turned into a string.
 *
 * ── Minor units, never a float ──────────────────────────────────────────
 *
 * `amount` is an integer count of the currency's smallest unit: 4820 is
 * $48.20, 4820 is also ¥4,820, and 4820 is 4.820 KWD. A card author who sends
 * `48.20` is sending a float, and 0.1 + 0.2 is why a cart total that renders
 * as $48.20 on one screen renders as $48.199999999999996 on another.
 *
 * ── Why the DIVISOR is not 100 ──────────────────────────────────────────
 *
 * Three of the world's currencies have no minor unit at all (JPY, KRW, VND
 * among them) and four have three digits (KWD, BHD, JOD, OMR). Dividing by
 * 100 renders ¥4,820 as ¥48 and 4.820 KWD as 48.200 KWD — wrong by two orders
 * of magnitude in both directions. `Intl.NumberFormat` already knows each
 * currency's digit count, so the divisor is READ off the formatter rather than
 * assumed, which means a currency added to CLDR after this was written is
 * right without a table here.
 *
 * ── Why this module exists rather than a line in each renderer ──────────
 *
 * There are four readers of a block envelope (the shared reader plus three
 * renderers — `check-block-renderer-parity.mjs` counts them) and a price
 * rendered by a hand-rolled `(amount / 100).toFixed(2)` in any one of them is
 * wrong for the currencies above and differently wrong from its siblings. The
 * same mistake, seventeen times over, is what
 * `scripts/check-time-formatting.mjs` exists to describe for timestamps;
 * `scripts/check-block-field-parity.mjs` is the equivalent for this one, and
 * it fails the build if a second `Intl.NumberFormat` appears.
 *
 * No zod and no imports: the widget's read path renders this, and
 * `href-guard.ts` records what one import of a zod schema costs that bundle
 * (15KB gzipped).
 */

/** A price on a card. `amount` and `compareAt` are both MINOR units. */
export interface Money {
  readonly amount: number;
  /** ISO 4217, upper case. */
  readonly currency: string;
  /** The was-price, struck through. Rendered only when above `amount`. */
  readonly compareAt?: number;
}

const CURRENCY_RE = /^[A-Z]{3}$/;

const isMinor = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/**
 * Read a price off a stored card, or null.
 *
 * The READ side, so it belongs here with the renderer rather than in the zod
 * schema: a row written before `price` was validated, or by a future code
 * path that forgets, must not reach `formatMoney` as a string and render
 * `NaN` at a shopper. Same contract as every other reader in this directory —
 * refuse what cannot be drawn, never throw.
 */
export function readMoney(raw: unknown): Money | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const bag = raw as Record<string, unknown>;
  const currency = bag['currency'];
  if (!isMinor(bag['amount']) || typeof currency !== 'string' || !CURRENCY_RE.test(currency)) {
    return null;
  }
  const compareAt = bag['compareAt'];
  return {
    amount: bag['amount'],
    currency,
    ...(isMinor(compareAt) ? { compareAt } : {}),
  };
}

/**
 * How many minor units make one major unit of this currency.
 *
 * `undefined` for `maximumFractionDigits` is possible on an engine with no
 * ICU data for the currency; 2 is the right guess for the overwhelming
 * majority and is what a hand-written version would have hardcoded anyway.
 */
function minorPerMajor(formatter: Intl.NumberFormat): number {
  const digits = formatter.resolvedOptions().maximumFractionDigits;
  return 10 ** (typeof digits === 'number' ? digits : 2);
}

/**
 * Format one amount in the VISITOR's locale.
 *
 * `locale` is the visitor's, not the workspace's: the widget runs in the
 * shopper's browser and a German shopper reads `48,20 $`. Passing `undefined`
 * means "whatever this browser is set to", which is the correct default and
 * the reason this is not done on the server — `blocksToPlainText` runs there
 * and uses `moneyToPlainText` below, which is deliberately locale-free.
 *
 * Never throws. `Intl.NumberFormat` raises `RangeError` on a currency code it
 * does not recognise, and a card with a typo in it must still show a price
 * rather than take the thread's render down.
 */
export function formatMoney(money: Money, locale?: string): string {
  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: money.currency,
    });
    return formatter.format(money.amount / minorPerMajor(formatter));
  } catch {
    return moneyToPlainText(money);
  }
}

/**
 * The locale-free rendition, for `messages.body`.
 *
 * `body` is generated on the SERVER and stored, so a locale baked into it
 * would be the server's rather than any reader's — the exact defect
 * `check-time-formatting.mjs`'s header describes for a Next server component.
 * `USD 48.20` is unambiguous to every reader and to the model reading the
 * thread as context on the next turn.
 *
 * Two decimal places, which is the one place this file does assume: there is
 * no `Intl` to ask without choosing a locale, and getting JPY's trailing
 * `.00` wrong in a transcript is a cosmetic cost where getting the DISPLAYED
 * price wrong by 100× is not.
 */
export function moneyToPlainText(money: Money): string {
  return `${money.currency} ${(money.amount / 100).toFixed(2)}`;
}
