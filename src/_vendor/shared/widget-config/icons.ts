/**
 * The widget's overridable icon names.
 *
 * Deliberately zod-free, like `copy.ts`: the widget imports this at runtime
 * and the bundle has a 50KB gzipped budget that zod would blow on its own.
 * The API layer builds its zod enum from this list, so the two cannot drift.
 */
export const WIDGET_ICON_NAMES = ['attachment', 'emoji', 'mic', 'stop', 'check', 'star'] as const;

export type WidgetIconName = (typeof WIDGET_ICON_NAMES)[number];

/** Longest an override may be — enough for a detailed inline SVG, not a font. */
export const WIDGET_ICON_MAX_LENGTH = 8_192;

/**
 * Markup that must never reach a visitor's browser.
 *
 * An icon override can be an inline `<svg>`, and SVG is not an inert image
 * format — it can carry `<script>`, event-handler attributes and
 * `javascript:` URLs, all of which execute in the page that embeds the
 * widget. Brand settings are written by workspace admins, so this is not the
 * primary trust boundary, but "can edit branding" should not silently mean
 * "can run JavaScript on every page the widget appears on". Those are
 * different permissions and only one of them was ever granted.
 */
const DANGEROUS = [/<\s*script/i, /\son\w+\s*=/i, /javascript:/i, /<\s*foreignObject/i];

export function isSafeIconOverride(value: string): boolean {
  return !DANGEROUS.some((re) => re.test(value));
}

/**
 * ═══ WHAT AN ICON STRING MEANS ════════════════════════════════════════════
 *
 * Four forms, and this is the ONE place that decides. The widget's
 * `planIcon` resolves them for rendering; `isUsableIconValue` below refuses
 * anything else on WRITE, which is the half that was missing — and which was
 * cited here by a name nothing exported for a day, while `theme.icons` went
 * out with no form check at all. See that function's own note.
 *
 *   1. a NAME from `WIDGET_ICON_NAMES` — the icons already in the bundle
 *   2. an image URL — `https://…`, `http://…`, `data:image/…`, or `/…`
 *   3. inline `<svg …>` markup
 *   4. a bare symbol or emoji, drawn as text
 *
 * ── Why a fifth "anything goes" form is not on that list ─────────────────
 *
 * A quick link's `icon` used to be `z.string().max(4000)` and the widget drew
 * whatever it was not able to recognise as text. So `icon: 'star'` rendered
 * the WORD "star" — while a `star` icon sat in the bundle unused — and
 * `icon: 'https://cdn.example/star.svg'` rendered the URL. A developer hit
 * exactly that, concluded Chatly "rejects values it doesn't know", and
 * shipped with no icons at all. Silently drawing a mistake as text is the
 * worst of the available behaviours: it looks deliberate.
 *
 * ── The rule for form 4, which is the only subtle one ────────────────────
 *
 * A symbol is accepted; a WORD is refused. The test is ASCII letters: `★`,
 * `→` and `🚀` carry none and are obviously intended as art, while `rocket`
 * and `calendar` are obviously intended as names and are almost certainly a
 * mistake. That makes the refusal precise enough to name the alternatives,
 * which is what turns a silent wrong result into an actionable 400.
 *
 * It is deliberately NOT a grapheme-cluster count. `Intl.Segmenter` is not
 * available on this project's browser floor, and a length check in UTF-16
 * code units mis-measures every flag and every ZWJ sequence — a family emoji
 * is eleven units. Asking "does this contain letters" avoids the question.
 */

/** An image URL the widget will draw in an `<img>`. */
const IMAGE_URL = /^(https?:\/\/|data:image\/|\/)/i;

export type IconValueKind = 'name' | 'image' | 'svg' | 'other';

/**
 * Which of the four forms a value is, or `null` if it is none of them.
 *
 * Exported so the widget and the API agree by CALLING this rather than by
 * each carrying its own sniff — the two-lists problem this repo keeps paying
 * for. Zod-free, like the rest of this module, because the widget imports it.
 */
export function iconValueKind(value: string): IconValueKind | null {
  const v = value.trim();
  if (v.length === 0) {
    return null;
  }
  if ((WIDGET_ICON_NAMES as readonly string[]).includes(v)) {
    return 'name';
  }
  if (IMAGE_URL.test(v)) {
    return 'image';
  }
  if (v.startsWith('<svg')) {
    return 'svg';
  }
  /*
   * Everything else is drawn as text, and the WIDGET needs no finer answer
   * than that — a symbol and a mistake render the same way.
   *
   * The symbol-versus-word rule lives on the write side
   * (`isSymbolOnlyIcon`, in the zod module this file deliberately does not
   * import) because it is a REFUSAL rule, not a rendering one. Keeping it out
   * of here keeps its regex out of a bundle every visitor downloads — the
   * same reasoning that makes this whole module zod-free.
   */
  return 'other';
}

/**
 * Is this a bare symbol rather than a word? The write-side half of the rule.
 *
 * `★`, `→` and `🚀` carry no ASCII letters and are obviously art; `rocket`
 * and `calendar` are obviously intended as names and are almost certainly a
 * mistake, so they are refused with the options named rather than drawn as
 * text — drawing a mistake looks deliberate.
 *
 * Deliberately NOT a grapheme count: `Intl.Segmenter` is past this project's
 * browser floor, and a UTF-16 length mis-measures every flag and ZWJ sequence
 * (a family emoji is eleven units). Asking "does it contain letters" sidesteps
 * the question entirely.
 */
export function isSymbolOnlyIcon(value: string): boolean {
  const v = value.trim();
  return v.length > 0 && v.length <= 16 && !/[A-Za-z]/.test(v);
}

/**
 * The whole write rule, in one predicate: is this one of the four forms?
 *
 * ── Why this is a function and not three copies of an expression ─────────
 *
 * The header above promised an `assertUsableIconValue` "below" that had never
 * been written: the rule lived as an inline `.refine` in `profiles.ts`, on
 * the quick-link `icon` and on nothing else. So when `theme.icons` was added
 * on 2026-10-20 — the same day, in the same commit, forty lines away in the
 * same schema — it took `z.string().min(1).max(…)` and the script filter and
 * NOT this rule, which is the defect that one inline expression was supposed
 * to have closed. `icons: { attachment: 'paperclip' }` was accepted, stored,
 * served and drawn as the WORD "paperclip" in the composer's attach button.
 *
 * It also closes a hole the inline version had. `iconValueKind` returns
 * `null` for a value that trims to nothing, and `null !== 'other'` is TRUE —
 * so `icon: '   '` passed `.min(1)`, passed the refine, and rendered an empty
 * span where an icon was asked for. A `null` kind is "none of the four
 * forms", which is the thing being refused, not an exemption from the test.
 */
export function isUsableIconValue(value: string): boolean {
  const kind = iconValueKind(value);
  if (kind === null) {
    return false;
  }
  return kind !== 'other' || isSymbolOnlyIcon(value);
}

/** The refusal, naming all four forms so a 400 is actionable. */
export const ICON_VALUE_REFUSAL =
  `not a usable icon — use a built-in name (${WIDGET_ICON_NAMES.join(', ')}), an image URL, ` +
  'inline `<svg …>` markup, or a single symbol such as an emoji';

/**
 * The same question for `theme.launcherIcon`, which is NARROWER — and the
 * reason it is narrower is the reason it needs its own predicate.
 *
 * Every other icon in the product goes through `planIconValue`, which
 * resolves all four forms. The launcher does not: `launcher.tsx` renders this
 * value with `dangerouslySetInnerHTML` and nothing else, so what it honours
 * is MARKUP — and a value that is not markup is drawn as a text node by the
 * browser, not by us. The consequences were all silent:
 *
 *   - `launcherIcon: 'star'` put the word "star" in the launcher bubble, on
 *     every page, while a `star` glyph sat unused in the bundle;
 *   - `launcherIcon: 'https://cdn.example/star.svg'` put the URL there
 *     (`theme.launcherImage` is the field that draws an image);
 *   - `launcherIcon: ''` — accepted, because the field carries no `.min(1)` —
 *     rendered an empty coloured circle with no icon at all.
 *
 * So markup is admitted on sight rather than by form: `<svg …>` is the
 * documented shape, but `<img …>` and a wrapped `<span>` have always worked
 * and narrowing that would be a regression for a capability nobody was told
 * to stop using. The script filter, not this, is what keeps markup safe.
 *
 * A bare symbol is admitted because it renders correctly as a text node — an
 * emoji launcher is a real choice. Everything else is a mistake drawn as
 * text, which is the worst outcome available: it looks deliberate.
 */
export function isUsableLauncherIcon(value: string): boolean {
  const v = value.trim();
  return v.includes('<') || isSymbolOnlyIcon(v);
}

/** The refusal for `launcherIcon`, naming the field that does each other job. */
export const LAUNCHER_ICON_REFUSAL =
  'launcherIcon is drawn as raw markup — use inline `<svg …>` markup or a single symbol such ' +
  'as an emoji. For an image use `theme.launcherImage`; for one of the widget’s own glyphs ' +
  'use `theme.icons`';
