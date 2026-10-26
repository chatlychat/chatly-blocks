/**
 * The `table` block, split out of `schema.ts`.
 *
 * Its own file because `schema.ts` crossed the 650-line ceiling when this
 * landed, and a comparison table is a self-contained shape with its own caps
 * and its own argument — the natural seam rather than a convenient one.
 *
 * ── Why the row/column rule is NOT here ────────────────────────────────
 *
 * "A row may not carry more cells than the table has columns" lives on the
 * ENVELOPE in `schema.ts`, not on this object. A `z.discriminatedUnion`
 * member must be a plain object: a `.refine()` makes it a `ZodEffects`, zod
 * can then no longer read `type` as the discriminator, and building the union
 * throws at module load. It fails loudly, which is the only mercy in it — but
 * it fails, so the rule has to sit one level up.
 */
import { z } from 'zod';

import { blockId } from './block-id.js';
import { mediaSrcSchema } from './media-src.js';

/**
 * A `table` block's shape.
 *
 * Six columns because the panel is 380px and a table scrolls sideways: at
 * seven the first column's label is off screen before the reader has found
 * the row they came for. Twelve rows because a comparison a shopper reads in
 * a chat bubble is a handful of attributes, and more is a page on the
 * merchant's own site — the same line `MAX_CARDS_PER_GRID` draws.
 */
export const MAX_TABLE_COLUMNS = 6;
export const MAX_TABLE_ROWS = 12;

export const tableBlockSchema = z
  .object({
    type: z.literal('table'),
    id: blockId.optional(),
    /** One line above the table. Optional: often the message body says it. */
    caption: z.string().min(1).max(200).optional(),
    columns: z
      .array(
        z
          .object({
            label: z.string().min(1).max(60),
            image: mediaSrcSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_TABLE_COLUMNS),
    rows: z
      .array(
        z
          .object({
            label: z.string().min(1).max(60),
            cells: z.array(z.string().max(120)).min(1).max(MAX_TABLE_COLUMNS),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_TABLE_ROWS),
  })
  .strict();
