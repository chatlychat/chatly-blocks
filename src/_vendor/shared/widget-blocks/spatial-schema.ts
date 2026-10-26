/**
 * The three spatial additions to the block protocol, split out of
 * `schema.ts` (which has no room left under the 650-line ceiling):
 * `card.model`, `card_grid.placement` and the `place` block.
 *
 * ── What they are for, and the one rule that decides the design ─────────
 *
 * In a 3D world the agent's answer is not a card list, it is objects standing
 * in front of you. A world host wants to know three things a flat surface
 * never asked: what to stand there (`model`), how to arrange a set of them
 * (`placement`), and where the visitor should be taken (`place`).
 *
 * **Every one of them is OPTIONAL and means NOTHING on a surface that does not
 * understand it.** A bot that writes spatial cards must still read well in
 * the web widget, the agent inbox, the e-mail transcript and an SMS. So:
 *
 *   - a card with a `model` is a card with an image and a title; no 2D
 *     surface draws, fetches or even reads the model, and the widget's first
 *     paint spends no bytes on it;
 *   - a grid with a `placement` is the grid or carousel its `layout` says;
 *   - a `place` block is a one-line destination in words (`blocksToPlainText`
 *     and every renderer say what), not a blank.
 *
 * ── Chatly sends INTENT, never world positions ──────────────────────────
 *
 * Each world owns its own scene. A `place` naming "the Nike shop's door" is
 * portable between worlds; one naming `x: 12.4, y: 0, z: -88.1` is a payload
 * for exactly one scene and a lie in every other. So there is NO coordinate
 * field anywhere below, and every object is `.strict()`: a `position`, `x`,
 * `coordinates` or `rotation` key is a 400 at the write boundary, not a
 * silently-ignored extra. `anchor` is a NAMED point on the model ("rests on
 * its base"), never a vector.
 *
 * What the schema cannot do is stop an author typing numbers into a free-text
 * `label`; nothing could. The one tripwire it does carry is on `ref` (see
 * `placeRefSchema`).
 */
import { z } from 'zod';

import { blockId } from './block-id.js';
import { mediaSrcSchema, refineAssetObject } from './media-src.js';

/**
 * How a set of cards is arranged in a world. Four named arrangements, not a
 * layout language: the world decides what an "arc" is in its own scene, and a
 * fifth arrangement is a protocol change rather than a string an author
 * invents. An enum is its own bound.
 */
export const GRID_PLACEMENTS = ['arc', 'shelf', 'wall', 'table'] as const;
export const gridPlacementSchema = z.enum(GRID_PLACEMENTS);
export type WidgetGridPlacement = z.infer<typeof gridPlacementSchema>;

/**
 * Where on a model the world should hold it. Named points, not a vector:
 * `base` rests on a surface (a shoe on a shelf), `back` sits flush against a
 * wall (a framed print), `top` hangs from above, `center` floats about its
 * middle. The world resolves the name in its own scene.
 */
export const MODEL_ANCHORS = ['center', 'base', 'top', 'back'] as const;
export type WidgetModelAnchor = (typeof MODEL_ANCHORS)[number];

/**
 * Bounds on `scale`. A multiplier on the model's own authored size, where
 * 1 is "as the file says". A hundredfold either way covers a ring to a
 * sofa; outside it the author has the wrong file, and a bound also keeps
 * `Infinity` and a zero-size model off the wire.
 */
export const MODEL_SCALE_MIN = 0.01;
export const MODEL_SCALE_MAX = 100;

/**
 * A 3D model to stand where the card's image would otherwise be.
 *
 * ── The URL is HOSTILE ─────────────────────────────────────────────────
 *
 * It is author-controlled and it reaches a renderer that will FETCH it, so
 * it is held to `mediaSrcSchema`: `https:` only, no control characters, no
 * untrimmed string, 2000 characters. That is this repo's one rule for an
 * author-supplied URL (`isSafeMediaSrc`); a third checker is a third place
 * for the C0-control lesson (trim() keeps them, browser URL parsers strip
 * them — refuse, never strip) to be forgotten.
 *
 * Chatly REFERENCES a model. It does not read, validate, size-limit or
 * optimise the file, and takes no glTF/USDZ parser dependency. Whether it
 * should (a poly budget, a mime sniff, a proxy) is an open product question
 * and not one this schema settles.
 *
 * Two questions about where this URL can arrive from were left open when this
 * block landed, and both were then checked rather than argued. The widget's
 * first-paint reader does NOT vet `model.url` — which is safe only if an
 * unvetted URL cannot reach anything that fetches it:
 *
 *   1. The widget never hands blocks OUT to the host page. The only `blocks`
 *      on the host-facing SDK surface is inbound, on `reportAction`; no widget
 *      code emits a block envelope to the page. So nothing leaks outward.
 *   2. That inbound path IS validated server-side, by an array of the real
 *      `widgetBlockSchema` (min 1, capped at `MAX_ACTION_RESULT_BLOCKS`) in
 *      `action-result.ts` — so a host cannot post a model URL that skipped
 *      `mediaSrcSchema` either.
 *
 * Private-network hosts WERE the open question here; they are refused now
 * (owner decision 2026-10-26: validate only, brands host their own files).
 * The `model` object also passes `net/asset-url.ts`'s STATIC rules — no
 * credentials, no loopback/private/link-local/metadata host, a `.gltf`,
 * `.glb` or `.usdz` extension. Static only, because this schema parses every
 * bot reply; the reachability and size probe runs on configuration writes.
 *
 * `format` is optional: a world can usually tell from the URL, and one that
 * cannot (a signed URL with no extension) needs the author to say. An iOS
 * world wants `usdz` and everything else wants `gltf`; a card that must serve
 * both is two cards or a world that converts, not two URLs on one object.
 */
export const modelSchema = z
  .object({
    url: mediaSrcSchema,
    format: z.enum(['gltf', 'usdz']).optional(),
    scale: z.number().min(MODEL_SCALE_MIN).max(MODEL_SCALE_MAX).optional(),
    anchor: z.enum(MODEL_ANCHORS).optional(),
  })
  .strict()
  // STATIC asset rules (https, no credentials, no private host, .gltf/.glb/
  // .usdz). No network here: this schema also parses every bot reply. The
  // reachability and size probe runs on configuration writes only.
  .superRefine(refineAssetObject('model'));
export type WidgetCardModel = z.infer<typeof modelSchema>;

/**
 * An id the WORLD issued for one of its own places — a room, a door, a
 * waypoint — which Chatly stores and hands back and never interprets.
 *
 * A short token: letters, digits and `. _ : / # -`, no whitespace, no comma.
 * That keeps "12.4, 0, -88.1" out by construction. A slash- or colon-joined
 * run of numbers (`12.4/0/-88.1`) fits the charset, so a refinement refuses
 * a ref that is two or more numeric components and nothing else. A bare `42`
 * is a legitimate world id and passes. This is a tripwire for the obvious
 * mistake, not a proof: an id the world happens to key by position is the
 * world's choice, and the `place` block does not become a coordinate channel
 * because someone encoded one.
 *
 * `refine` on a STRING field is fine inside a discriminated-union member; it
 * is a refine on the OBJECT that makes zod unable to read the discriminator.
 */
const NUMERIC_TUPLE = /^-?\d+(\.\d+)?([/:#]-?\d+(\.\d+)?)+$/;
export const placeRefSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/#-]*$/, 'ref is a short token with no spaces')
  .refine((ref) => !NUMERIC_TUPLE.test(ref), {
    message: 'ref must name a place, not encode coordinates',
  });

/**
 * A named destination: "take the visitor to…".
 *
 * ── What it renders where there is no world (the part that is not "nothing")
 *
 * `label` is a human sentence fragment — "Nike store, front door" — and it is
 * REQUIRED, because the label IS the block on every surface that has no
 * scene. Each renders it as text: the widget as a line in the thread, the
 * inbox as a labelled row, mobile and React Native the same, and
 * `blocksToPlainText` as `Place: <label> (<detail>)`, which is what SMS, the
 * e-mail text part, push previews, search and the model's next-turn context
 * read. `order_status` faced the same question ("a block that IS the answer
 * must not be a blank") and this is the same resolution: the substance is
 * words, and the 3D behaviour is the ornament.
 *
 * `detail` is the directions-in-words a person without a scene needs: "Level
 * 2, next to the escalator". Optional, because a good `label` often says it.
 *
 * `ref` is the world's own id for the place when the author knows it. Without
 * one a world resolves `label` by name, which is brittle and is why `ref`
 * exists. See `placeRefSchema` for what it may not be.
 *
 * ── Accessibility: what is the button? ─────────────────────────────────
 *
 * There is deliberately NO `action` on a `place`. A world action needs a
 * non-spatial equivalent, and for navigation that equivalent is this block's
 * own text: the destination is named in words, readable by a screen reader
 * and by anyone not in the scene. A world host that offers "Take me there"
 * owes the visitor a keyboard-reachable control whose accessible name is
 * `label`; that control belongs to the host (only it can move the visitor),
 * and a `host_event` in an ordinary `actions` block beside the `place` is
 * how an author wires one. Giving `place` its own action would have created a
 * sixth way for a block to be operable, a positional id for it
 * (`action-id.ts`), and a button the widget would have to draw at first paint
 * for a destination it cannot take anyone to.
 */
export const placeBlockSchema = z
  .object({
    type: z.literal('place'),
    id: blockId.optional(),
    label: z.string().min(1).max(120),
    detail: z.string().min(1).max(300).optional(),
    ref: placeRefSchema.optional(),
  })
  .strict();
export type WidgetPlaceBlock = z.infer<typeof placeBlockSchema>;
