/**
 * An image or video `src`, as one schema both the block union and the table
 * block can import.
 *
 * Extracted when the `table` block moved into its own module: both need this,
 * and having `table-schema.ts` import it back out of `schema.ts` would be a
 * CYCLE — and a cycle between two files that build zod schemas at module
 * scope is a TDZ crash at import time, not a type error. So it moves down to
 * a leaf both can depend on.
 *
 * Held to the same standard as an action's `href` — see `isSafeMediaSrc` for
 * why `http:` and `data:` are refused. The write boundary refuses; the render
 * boundary (`read-envelope.ts`) drops. Both, because a row stored before this
 * refinement existed still has to render safely.
 */
import { z } from 'zod';

import { isSafeMediaSrc } from './href-guard.js';
import { checkAssetUrlStatic, type AssetKind } from '../net/asset-url.js';

export const mediaSrcSchema = z
  .string()
  .min(1)
  .max(2000)
  .refine(isSafeMediaSrc, { message: 'src must be an https: URL with no control characters' });

/**
 * A 3D-world asset URL (font, sound) held to the STATIC asset rules: https,
 * no credentials, no private host, an allowed extension. See
 * `net/asset-url.ts` for the two-tier split and why the network probe is not
 * here. Message names the rule, and the caller's path names the field.
 */
export const assetUrlSchema = (kind: AssetKind) =>
  z
    .string()
    .min(1)
    .max(2000)
    .superRefine((value, ctx) => {
      const r = checkAssetUrlStatic(value, kind);
      if (!r.ok) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${kind} URL ${r.reason}` });
      }
    });

/**
 * The same rules for an object that carries a `url` and an optional
 * `format` (a card model, an avatar): the declared format may excuse a signed
 * URL's missing extension and may not contradict a present one.
 */
export function refineAssetObject<T extends { url: string; format?: string | undefined }>(
  kind: AssetKind,
) {
  return (value: T, ctx: z.RefinementCtx): void => {
    const r = checkAssetUrlStatic(value.url, kind, value.format);
    if (!r.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message: `${kind} URL ${r.reason}`,
      });
    }
  };
}
