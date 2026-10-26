/**
 * The pure half of the action contract: no zod, no dependencies.
 *
 * ── Why this is its own module ──────────────────────────────────────────
 *
 * The widget imports `isSafeActionHref` to re-check an href at the DOM sink.
 * While it lived beside the zod schema, importing it pulled **zod into the
 * widget bundle** — measured: 47,525 → 62,591 bytes gzipped, 15KB for a
 * validator the widget does not need, because the server already validated on
 * write. The widget's budget is 50,000.
 *
 * So the guard lives here, where anything can import it for free, and
 * `actions.ts` imports it to build the schema.
 */
/** A dotted identifier: `cart.add`, `booking.reschedule`. Max four segments. */
export const HOST_EVENT_NAME_RE = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){0,3}$/;

const ALLOWED_SCHEMES = new Set(['https:', 'mailto:', 'tel:']);

/**
 * Is this href safe to put in an `href` attribute?
 *
 * ── Why control characters are REFUSED and not stripped ─────────────────
 *
 * `trim()` leaves C0 control characters in place and browser URL parsers
 * remove them, so `java\x01script:alert(1)` survives a scheme allow-list
 * applied to the raw string and then executes after the browser normalises
 * it. Stripping first is not a fix: it means the allow-list was applied to a
 * string the browser will never see. The only safe answer is to refuse the
 * input — see `reference_c0_control_char_xss`.
 *
 * `http:` is excluded as well as `javascript:`. A card is served into an
 * HTTPS page; an http link is a mixed-content downgrade the author did not
 * intend.
 */
export function isSafeActionHref(href: string): boolean {
  if (href.length === 0 || href.length > 2000) {
    return false;
  }
  // Any C0 control character, DEL, or leading/trailing whitespace: refuse.
  // eslint-disable-next-line no-control-regex -- matching control characters IS the check
  if (/[\u0000-\u001F\u007F]/.test(href) || href !== href.trim()) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    // Relative and protocol-relative hrefs both land here. A block author
    // addresses a page on the open web, so a relative URL has no base to
    // resolve against that we can reason about.
    return false;
  }
  return ALLOWED_SCHEMES.has(parsed.protocol);
}

/** The longest `navigate` path. A route plus a query string, not a document. */
export const NAVIGATE_PATH_MAX = 512;

/**
 * Is this a path on the integrator's own site, safe to join onto an origin?
 *
 * The `navigate` action carries a PATH and never a URL, so the one thing the
 * check must guarantee is that `origin + path` cannot leave `origin`. Each
 * refusal closes a way it could:
 *
 *  - must start with a single `/`, and contain no `//` anywhere: `//evil.com`
 *    is a protocol-relative URL, and `/a//b` is refused with it because a
 *    router that collapses slashes turns the second into the first.
 *  - no `\`: browsers treat it as `/`, so `/\evil.com` is `//evil.com`.
 *  - no C0 control character or DEL, and no whitespace (see `isSafeActionHref`
 *    for why these are refused and not stripped: the browser strips them AFTER
 *    the check ran).
 *  - no `.` or `..` segment, nor their percent-encoded spellings (`%2e`), and
 *    no encoded slash or backslash: each is a way to climb out of the path the
 *    integrator meant, once a server or router decodes it.
 *  - no `@` in the first segment and no `:` there: with the leading slash that
 *    cannot form an authority, but `/x:y` is a path some routers read as a
 *    scheme, and nobody's route needs it.
 */
export function isSafeNavigatePath(path: string): boolean {
  if (path.length < 1 || path.length > NAVIGATE_PATH_MAX || path[0] !== '/') {
    return false;
  }
  // eslint-disable-next-line no-control-regex -- matching control characters IS the check
  if (/[\u0000-\u0020\u007F\\]/.test(path) || path.includes('//')) {
    return false;
  }
  if (/%(?:2e|2f|5c|00)/i.test(path)) {
    return false;
  }
  const pathOnly = path.split(/[?#]/)[0] ?? path;
  if (pathOnly.split('/').some((seg) => seg === '.' || seg === '..')) {
    return false;
  }
  return !/^\/[^/?#]*[:@]/.test(path);
}

/**
 * The origin a channel declares for its own site: the FIRST `allowedOrigins`
 * entry that is a concrete origin, or null.
 *
 * Reuses the list the channel already has instead of a second field, because
 * it is already server-validated as a list of origins, already edited in the
 * dashboard, and already means "the sites this widget runs on". The cost is
 * that order carries meaning: the first entry is the primary site. A wildcard
 * entry (`https://*.shop.com`) names no single origin and is skipped, as is
 * an entry that is not https (http only for localhost, for local development).
 * Null is a normal answer — an empty list means "any site" — and then a
 * surface that has no page of its own to borrow an origin from shows the path.
 */
export function resolveSiteOrigin(
  allowedOrigins: readonly string[] | null | undefined,
): string | null {
  for (const raw of allowedOrigins ?? []) {
    if (raw.includes('*')) {
      continue;
    }
    try {
      const u = new URL(raw);
      if (u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === 'localhost')) {
        return u.origin;
      }
    } catch {
      // Not a URL: not an origin either.
    }
  }
  return null;
}

/** `origin + path`, or the path alone when the channel declares no origin. */
export function navigateUrl(siteOrigin: string | null, path: string): string {
  return siteOrigin === null ? path : siteOrigin + path;
}

/**
 * Whether a string may be used as the `src` of an image or video we render.
 *
 * `https:` only, and the same C0 refusal as above.
 *
 * This is NOT a script-execution control. `javascript:` in an `<img src>`
 * does not execute, and neither does a `data:` image; the renderers hold no
 * HTML sink. Two narrower things are the point:
 *
 *  - `http:` on an HTTPS host page is mixed content. The browser blocks the
 *    image and shows the visitor a broken card and, in some browsers, a
 *    security downgrade on the host's own padlock — the host site's problem,
 *    caused by our payload.
 *  - An action's `href` is already held to `https:`/`mailto:`/`tel:`. A card's
 *    `image` sitting beside it with no standard at all is the kind of
 *    asymmetry that reads as an oversight because it was one.
 *
 * `data:` is refused rather than allow-listed by media type. A data URI large
 * enough to be a real image is also large enough to be the whole message, and
 * the envelope's byte cap is a blunter instrument than a URL. Customers who
 * need to inline an asset upload it and serve the returned URL.
 */
export function isSafeMediaSrc(src: string): boolean {
  if (src.length === 0 || src.length > 2000) {
    return false;
  }
  // eslint-disable-next-line no-control-regex -- matching control characters IS the check
  if (/[\u0000-\u001F\u007F]/.test(src) || src !== src.trim()) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:';
}

/**
 * Hosts an app iframe may never point at.
 *
 * Mirrors `BLOCKED_HOSTS` in the canvas endpoint guard, but for a DIFFERENT
 * threat. The endpoint guard stops OUR server being pointed at our own
 * network — classic SSRF. This one stops us pointing EVERY VISITOR'S BROWSER
 * at theirs: an app url of `https://192.168.1.1/` is fetched from inside the
 * visitor's house, or their employer's network, with their cookies. We would
 * be the delivery mechanism for a scan of a network we cannot see.
 *
 * Private IPv4 ranges are matched numerically rather than by prefix string,
 * because `10.0.0.5` and `010.0.0.5` and `0xa.0.0.5` are the same address to
 * a browser and three different strings to a `startsWith`.
 */
const BLOCKED_APP_HOST_NAMES = new Set([
  'localhost',
  '0.0.0.0',
  '::1',
  '::',
  '169.254.169.254',
  'metadata.google.internal',
  'metadata',
]);

/** `.local` is mDNS (printers, NAS boxes); `.internal` is a cloud convention. */
const BLOCKED_APP_HOST_SUFFIXES = ['.local', '.internal', '.localhost', '.home.arpa'];

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) {
    return false;
  }
  const nums = parts.map((p) => {
    // A browser accepts decimal, octal and hex octets. Normalise all three
    // rather than trusting the decimal spelling.
    if (!/^(0[xX][0-9a-fA-F]+|[0-9]+)$/.test(p)) {
      return Number.NaN;
    }
    return Number(p);
  });
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = nums as [number, number, number, number];
  if (a === 10 || a === 127 || a === 0) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  // 169.254/16 link-local, which is where the cloud metadata services live.
  if (a === 169 && b === 254) {
    return true;
  }
  return false;
}

/**
 * Whether a url may be the `src` of a Tier 3 app iframe.
 *
 * Stricter than `isSafeMediaSrc`, because an iframe src EXECUTES. Three
 * schemes matter and all three are refused except https:
 *
 *  - `javascript:` in an iframe src runs in the EMBEDDER's origin, which is
 *    the host customer's page, not ours. That is a stored XSS on someone
 *    else's site delivered through our widget.
 *  - `data:text/html` scripts in an opaque origin. It cannot reach the host
 *    page, but it can phish inside a frame the visitor believes is the host's
 *    chat, and there is no legitimate use for it here.
 *  - `http:` is mixed content and the browser blocks it, leaving a blank box.
 *
 * It does NOT decide the sandbox. The renderer always applies the same sandbox
 * attribute, and no caller may vary it — see the app renderer.
 */
export function isSafeAppUrl(url: string): boolean {
  if (url.length === 0 || url.length > 2000) {
    return false;
  }
  // eslint-disable-next-line no-control-regex -- matching control characters IS the check
  if (/[\u0000-\u001F\u007F]/.test(url) || url !== url.trim()) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') {
    return false;
  }
  // Credentials in the url reach the integrator's access log, and anyone the
  // visitor shows their screen to.
  if (parsed.username !== '' || parsed.password !== '') {
    return false;
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_APP_HOST_NAMES.has(host)) {
    return false;
  }
  if (BLOCKED_APP_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return false;
  }
  if (isPrivateIpv4(host)) {
    return false;
  }
  // An IPv6 literal of any kind: refuse. A legitimate app is served from a
  // name, and the unique-local / link-local ranges are not worth enumerating
  // when nothing needs the capability.
  if (host.includes(':')) {
    return false;
  }
  // A bare host with no dot is an intranet name ("wiki", "jenkins").
  if (!host.includes('.')) {
    return false;
  }
  return true;
}
