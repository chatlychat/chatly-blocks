/**
 * The STATIC rules for an author-supplied 3D-world asset URL — a card model,
 * an avatar, a theme font, a theme sound.
 *
 * ── Chatly stores the URL; the brand hosts the file ─────────────────────────
 *
 * Owner decision, 2026-10-26: asset hosting is VALIDATE ONLY. Chatly never
 * stores, proxies, transcodes or caches the file, so there is nothing here to
 * parse and no dependency on a glTF reader. What it owes the author is a
 * refusal at save time for a URL no world could load, and what it owes the
 * visitor is that a world is never pointed at `https://192.168.1.1/x.glb`
 * from inside their house.
 *
 * ── Two tiers, and this file is the cheap one ───────────────────────────────
 *
 *  1. STATIC (this file; pure, no I/O): scheme, credentials, length, control
 *     characters, host class (the repo's one SSRF guard, `checkOutboundUrl`)
 *     and the file extension. It is wired into the zod schemas themselves
 *     (`modelSchema`, `avatarAssetSchema`, `worldThemeSchema`), so it runs on
 *     EVERY path that parses one — including a bot reply, where a card's
 *     `model` arrives on every message and a network probe would add latency
 *     to each of them.
 *  2. PROBE (apps/api `spatial-assets/asset-url-probe.ts`): a HEAD, falling
 *     back to a ranged GET, for reachability and size. Configuration writes
 *     only (channel `worldTheme`, a bot persona's `world`).
 *
 * The probe's tier is the only one that can say "too large" or "not there".
 * The static tier cannot, and does not pretend to.
 */
import { checkOutboundUrl } from './url-guard.js';
import { isSafeMediaSrc } from '../widget-blocks/href-guard.js';

export const ASSET_KINDS = ['model', 'avatar', 'font', 'sound'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** The longest URL accepted. Same figure as `isSafeMediaSrc`. */
export const ASSET_URL_MAX_LENGTH = 2000;

/**
 * Per-kind size caps, in bytes, enforced against `content-length` by the
 * probe. A model is a scene prop; an avatar is a rigged, textured body and
 * is allowed to be heavier per the owner's figures only for models, not for
 * avatars — hence 50 MB and 30 MB as decided.
 */
export const ASSET_MAX_BYTES: Readonly<Record<AssetKind, number>> = {
  model: 50 * 1024 * 1024,
  avatar: 30 * 1024 * 1024,
  font: 5 * 1024 * 1024,
  sound: 10 * 1024 * 1024,
};

/**
 * Allowed extensions per kind.
 *
 * `.vrm` is an AVATAR format only (see `spatial/avatar.ts`): a card is a prop
 * in a shop, and a rigged humanoid in a card's `model` slot is a mistake the
 * `format` enum (`gltf | usdz`) already refuses.
 */
export const ASSET_EXTENSIONS: Readonly<Record<AssetKind, readonly string[]>> = {
  model: ['.gltf', '.glb', '.usdz'],
  avatar: ['.gltf', '.glb', '.usdz', '.vrm'],
  font: ['.ttf', '.otf', '.woff', '.woff2'],
  sound: ['.mp3', '.ogg', '.wav', '.m4a'],
};

/** Which extensions each declared `format` is consistent with. */
const FORMAT_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  gltf: ['.gltf', '.glb'],
  usdz: ['.usdz'],
  vrm: ['.vrm'],
};

export type AssetUrlCheck =
  | { readonly ok: true; readonly url: URL }
  | { readonly ok: false; readonly reason: string };

function extensionOf(pathname: string): string {
  const last = pathname.split('/').pop() ?? '';
  const dot = last.lastIndexOf('.');
  return dot <= 0 ? '' : last.slice(dot).toLowerCase();
}

/**
 * The host-and-scheme half, without the extension rule. The probe re-applies
 * exactly this to every redirect hop, where the extension is not the point.
 */
export function checkAssetHost(raw: string): AssetUrlCheck {
  if (raw.length === 0 || raw.length > ASSET_URL_MAX_LENGTH) {
    return { ok: false, reason: `must be 1 to ${String(ASSET_URL_MAX_LENGTH)} characters` };
  }
  // https-only, no control characters, no untrimmed string: the repo's one
  // media-URL rule, so the C0-control lesson lives in one place.
  if (!isSafeMediaSrc(raw)) {
    return { ok: false, reason: 'must be an https: URL with no control characters' };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'is not a valid absolute URL' };
  }
  if (url.username !== '' || url.password !== '') {
    return { ok: false, reason: 'must not carry credentials (user:password@host)' };
  }
  const guard = checkOutboundUrl(raw);
  if (!guard.ok) {
    return {
      ok: false,
      reason: `points at a private, loopback, link-local or metadata host (${guard.reason ?? 'refused'})`,
    };
  }
  return { ok: true, url };
}

/**
 * Every static rule for one asset URL.
 *
 * `format` is the author's declared format where the field has one (a card
 * model, an avatar). With it, an extension that contradicts it is refused,
 * and a URL with NO extension (a signed URL) is accepted — the author said
 * what the file is. Without a `format`, the extension must be on the list.
 */
export function checkAssetUrlStatic(raw: string, kind: AssetKind, format?: string): AssetUrlCheck {
  const host = checkAssetHost(raw);
  if (!host.ok) {
    return host;
  }
  const allowed = ASSET_EXTENSIONS[kind];
  const ext = extensionOf(host.url.pathname);
  if (ext === '') {
    if (format !== undefined && (kind === 'model' || kind === 'avatar')) {
      return host;
    }
    return {
      ok: false,
      reason: `has no file extension; a ${kind} must end in ${allowed.join(', ')}`,
    };
  }
  if (!allowed.includes(ext)) {
    return {
      ok: false,
      reason: `has extension ${ext}; a ${kind} must end in ${allowed.join(', ')}`,
    };
  }
  if (format !== undefined) {
    const fits = FORMAT_EXTENSIONS[format];
    if (fits !== undefined && !fits.includes(ext)) {
      return { ok: false, reason: `ends in ${ext}, which contradicts format "${format}"` };
    }
  }
  return host;
}
