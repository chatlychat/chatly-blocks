/**
 * The block protocol version, in a module that imports nothing.
 *
 * It lives apart from `schema.ts` because `schema.ts` imports zod and the
 * widget's render path must not. `read-envelope.ts` and the widget both reach
 * for this file; `schema.ts` re-exports it so there is still only one literal.
 */
export const BLOCK_PROTOCOL_VERSION = 1;
