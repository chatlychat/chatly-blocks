export {
  BLOCK_PROTOCOL_VERSION,
  MAX_BLOCKS_PER_MESSAGE,
  MAX_CARDS_PER_GRID,
  MAX_CARD_ACTIONS,
  MAX_CARD_ACTIONS_VISIBLE,
  MAX_CARD_BADGES,
  MAX_ENVELOPE_BYTES,
  MAX_FIELDS_PER_BLOCK,
  MAX_ORDER_STATUS_STEPS,
  MAX_QUICK_REPLIES,
  MAX_SOURCES,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  MAX_VARIANTS_PER_CARD,
  parseBlocksEnvelope,
  widgetBlockSchema,
  widgetBlocksEnvelopeSchema,
  type WidgetBlock,
  type WidgetBlocksEnvelope,
  type WidgetCard,
  type WidgetCardModel,
  type WidgetCardStock,
  type WidgetCardVariant,
  type WidgetGridMore,
  type WidgetGridPlacement,
  type WidgetOrderStatusStep,
  type WidgetPlaceBlock,
  type WidgetSource,
} from './schema.js';
export { positionalActionId, widgetActionSchema, type WidgetAction } from './actions.js';
export {
  ACTION_RESULT_METADATA_KEY,
  actionResultBlockId,
  actionResultInputSchema,
  actionResultStatusSchema,
  deliveredActionResult,
  MAX_ACTION_RESULT_BLOCKS,
  MAX_ACTION_RESULT_TEXT,
  type ActionResultInput,
  type ActionResultStatus,
  type DeliveredActionResult,
} from './action-result.js';
/*
 * `money.ts` is also exported on its own subpath (`widget-blocks/money`), and
 * that is the import the widget's renderers use. Here as well so a server-side
 * caller taking the barrel gets the formatter rather than hand-rolling one —
 * `scripts/check-block-field-parity.mjs` fails the build on a second
 * `Intl.NumberFormat`, so there has to be a reachable first one.
 */
export { formatMoney, moneyToPlainText, readMoney, type Money } from './money.js';
export {
  HOST_EVENT_NAME_RE,
  NAVIGATE_PATH_MAX,
  isSafeActionHref,
  isSafeAppUrl,
  isSafeMediaSrc,
  isSafeNavigatePath,
  navigateUrl,
  resolveSiteOrigin,
} from './href-guard.js';
export { readBlocksEnvelope } from './read-envelope.js';
export { navigateLinks, type NavigateLink } from './navigate-links.js';
export { blocksToPlainText, NO_TEXT_CONTENT } from './plain-text.js';
export { CARD_REF_RE } from './block-id.js';
export {
  applyBlockPatches,
  applyCardSetByRef,
  blockPatchSchema,
  type BlockPatch,
  type BlockPatchResult,
} from './patch.js';
