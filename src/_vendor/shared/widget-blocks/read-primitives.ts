/**
 * The primitives every READ pass over a block envelope shares.
 *
 * A leaf: no imports but the erased type of an action, so it can sit under
 * both halves of a reader that rollup is required to cut in two. That
 * requirement is the whole reason this file exists rather than
 * `read-envelope.ts` exporting these three. `read-envelope-commerce.ts` needs
 * `readAction` for a grid's paging tile, and the widget's first paint imports
 * `readBlocksEnvelopeBase` from `read-envelope.ts` — so had the extension
 * imported its helpers FROM the base module, the import edge would point the
 * wrong way and the thing being deferred would be reachable from the thing
 * that must not reach it.
 *
 * It also keeps the subpath surface of `widget-blocks/read-envelope` exactly
 * as it was. `isBag` and `str` are the kind of helper that becomes an
 * accidental public API the moment it is exported from a file somebody
 * imports by name.
 *
 * `read-spatial.ts` holds its own copy of `Bag`, `isBag` and `str`. That is a
 * SECOND copy and it is left alone deliberately: it is four lines, it is the
 * third reader pass rather than a half of this one, and nothing about this
 * split makes it worse. If a fourth pass ever wants them, they are here.
 */
import type { WidgetAction } from './actions.js';

export type Bag = Record<string, unknown>;

export const isBag = (v: unknown): v is Bag =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
export const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** The one field each kind must carry. A table: a new kind is one entry, not one more `case`. */
const REQUIRED: Record<string, string> = {
  url: 'href',
  postback: 'value',
  host_event: 'event',
  step: 'canvasId',
  copy: 'text',
  navigate: 'path',
};

export function readAction(raw: unknown): WidgetAction | null {
  if (!isBag(raw) || !str(raw['label'])) {
    return null;
  }
  // `typeof` and not a truthiness test: `REQUIRED['toString']` is a function.
  const key = REQUIRED[raw['kind'] as string];
  return typeof key === 'string' && str(raw[key]) ? (raw as unknown as WidgetAction) : null;
}

export function readActions(raw: unknown): WidgetAction[] {
  return Array.isArray(raw) ? raw.map(readAction).filter((a): a is WidgetAction => a !== null) : [];
}
