/**
 * A block's optional author-chosen id, as one schema every block module can
 * import.
 *
 * Extracted alongside `media-src.ts` when the `table` block moved out: both
 * `schema.ts` and `table-schema.ts` need it, and importing it back up would
 * be a cycle between two modules that build zod schemas at module scope —
 * which is a TDZ crash at import, not a type error.
 *
 * The charset is deliberately narrow. An id is addressed by
 * `PATCH /v1/messages/{id}/blocks` and correlated by `reportAction`, so it
 * travels in a JSON pointer and in an analytics key; anything that needs
 * escaping in either is a problem waiting for a different day.
 */
import { z } from 'zod';

export const blockId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._:-]+$/);
