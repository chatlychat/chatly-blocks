/**
 * Reading the three spatial additions: `card.model`, `card_grid.placement`
 * and the `place` block. A LEAF — `href-guard` and nothing else — and the
 * shared reader's THIRD PASS, composed by `readBlocksEnvelope` after the
 * commerce extension.
 *
 * ── Why this is a third pass and costs the widget no first-paint bytes ──
 *
 * The widget draws none of `model`, `placement` or `ref`: a 2D surface has no
 * use for them. `readBlocksEnvelopeBase` passes unknown keys through
 * untouched, so `model` and `placement` already reach the widget unread. This
 * file is imported only by `readBlocksEnvelope`, which no widget bundle
 * imports — and NOT by `extendCommerceBlocks`, so `widget-commerce.js`
 * carries none of it either (folding it in measured +323 gzipped bytes of a
 * 500-byte combined spare). The one thing the base reader must itself know is
 * that `place` is a block TYPE it keeps — see its `case`.
 *
 * **The consequence a world host must know:** the widget's first-paint read
 * does NOT validate `model.url`. That is safe only because nothing in the
 * widget touches it. A world renderer must read through `readBlocksEnvelope`
 * (base, commerce, then this), where an unsafe model is dropped, and never through the
 * base reader alone.
 *
 * ── Rules, all in the "drop the decoration, keep the card" family ───────
 *
 *  - `model` with an unsafe url (`isSafeMediaSrc`: https only, NO control
 *    characters — refuse, never strip) loses the MODEL; the card, its image
 *    and its title are the substance and still render. A readable url with a
 *    malformed `scale`, `format` or `anchor` keeps the model and loses only
 *    the bad field: a model at default size is a better answer than none.
 *  - `placement` outside the four names is dropped. A world switches on it.
 *  - a `place` keeps its `label` (checked by the base reader) and loses a
 *    `detail` or `ref` that is not a string.
 *
 * Every write is IN PLACE on the object the base reader built, and a key is
 * touched only when present, so a message with none of the three reads
 * byte-identically to before they existed — the property
 * `read-envelope.parity.spec.ts` compares with `JSON.stringify`.
 * `packages/sdk-react-native/src/blocks/read-envelope.ts` restates all of it.
 */
import { isSafeMediaSrc } from './href-guard.js';

type Bag = Record<string, unknown>;

const isBag = (v: unknown): v is Bag => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Mirrors `GRID_PLACEMENTS` in `spatial-schema.ts`; restated to keep zod out. */
const PLACEMENTS = new Set(['arc', 'shelf', 'wall', 'table']);
const ANCHORS = new Set(['center', 'base', 'top', 'back']);
const FORMATS = new Set(['gltf', 'usdz']);

/** A model, or null when its url cannot be fetched safely. */
function readModel(raw: unknown): Bag | null {
  if (!isBag(raw) || !str(raw['url']) || !isSafeMediaSrc(raw['url'])) {
    return null;
  }
  const model: Bag = { ...raw };
  const { scale, anchor, format } = model;
  if (typeof scale !== 'number' || !(scale >= 0.01 && scale <= 100)) {
    delete model['scale'];
  }
  if (!ANCHORS.has(anchor as string)) {
    delete model['anchor'];
  }
  if (!FORMATS.has(format as string)) {
    delete model['format'];
  }
  return model;
}

function readCardModel(card: Bag): void {
  if (card['model'] !== undefined) {
    const model = readModel(card['model']);
    if (model === null) {
      delete card['model'];
    } else {
      card['model'] = model;
    }
  }
}

/**
 * `model` on each card, `placement` on a grid, `detail` and `ref` on a place.
 * In place, on a block the base reader copied.
 */
export function extendSpatial(bag: Bag): void {
  if (bag['type'] === 'card') {
    readCardModel(bag);
  } else if (bag['type'] === 'card_grid') {
    for (const card of bag['cards'] as Bag[]) {
      readCardModel(card);
    }
    if (bag['placement'] !== undefined && !PLACEMENTS.has(bag['placement'] as string)) {
      delete bag['placement'];
    }
  } else if (bag['type'] === 'place') {
    for (const key of ['detail', 'ref']) {
      if (bag[key] !== undefined && !str(bag[key])) {
        delete bag[key];
      }
    }
  }
}
