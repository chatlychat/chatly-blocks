/*
 * This file is the only one that imports the server's own schema. The build
 * (`scripts/build.mjs`) bundles it, and zod with it, into `dist/index.js`, so
 * the published package has no runtime dependency and `validate` runs the very
 * code the API runs. There is no second implementation to drift.
 */
import {
  HOST_EVENT_NAME_RE as HOST_EVENT_NAME_RE_SHARED,
  MAX_BLOCKS_PER_MESSAGE,
  MAX_CARDS_PER_GRID,
  MAX_CARD_ACTIONS,
  MAX_CARD_ACTIONS_VISIBLE,
  MAX_CARD_BADGES,
  MAX_ENVELOPE_BYTES,
  MAX_FIELDS_PER_BLOCK,
  MAX_ORDER_STATUS_STEPS,
  MAX_QUICK_REPLIES,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  MAX_VARIANTS_PER_CARD,
  widgetBlocksEnvelopeSchema,
} from './_vendor/shared/widget-blocks/index.js';

import type { Issue } from './types.js';

export const HOST_EVENT_NAME_RE: RegExp = HOST_EVENT_NAME_RE_SHARED;

/** The caps the server enforces, for building within them. */
export const LIMITS = {
  blocks: MAX_BLOCKS_PER_MESSAGE,
  cardsPerGrid: MAX_CARDS_PER_GRID,
  cardActions: MAX_CARD_ACTIONS,
  cardActionsVisible: MAX_CARD_ACTIONS_VISIBLE,
  cardBadges: MAX_CARD_BADGES,
  envelopeBytes: MAX_ENVELOPE_BYTES,
  fieldsPerBlock: MAX_FIELDS_PER_BLOCK,
  orderStatusSteps: MAX_ORDER_STATUS_STEPS,
  quickReplies: MAX_QUICK_REPLIES,
  tableColumns: MAX_TABLE_COLUMNS,
  tableRows: MAX_TABLE_ROWS,
  variantsPerCard: MAX_VARIANTS_PER_CARD,
};

/** `['blocks', 2, 'title']` -> `blocks[2].title`. */
export function formatPath(path: readonly (string | number)[]): string {
  let out = '';
  for (const seg of path) {
    out += typeof seg === 'number' ? `[${seg}]` : out === '' ? seg : `.${seg}`;
  }
  return out;
}

/** Everything the server would refuse about `input`; empty means it would accept it. */
export function validate(input: unknown): Issue[] {
  const result = widgetBlocksEnvelopeSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((i) => ({ path: formatPath(i.path), reason: i.message }));
}
