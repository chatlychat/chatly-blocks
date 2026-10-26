/**
 * Guard for outbound URLs that a CUSTOMER controls.
 *
 * Workflow authors can point `http_request` at any URL, and custom AI tools
 * are the same story. Without a check, "can edit automation" silently becomes
 * "can read anything the worker can reach" — the worker sits inside the
 * private network, so an admin could aim a workflow at the cloud metadata
 * endpoint and exfiltrate instance credentials into a conversation, or sweep
 * internal services that were never meant to face customers. Those are
 * different privileges and only one of them was granted.
 *
 * ── What this can and cannot do ──
 * This blocks the literal-address and hostname cases. It does NOT close
 * DNS rebinding, where a public hostname resolves to a private address at
 * connect time: catching that requires resolving the name and pinning the
 * socket to the resolved IP, which `fetch` gives no hook for. `assertSafeUrl`
 * is therefore a necessary layer, not a complete one — see
 * `resolvesToBlockedAddress` for the resolution-time half, which callers
 * with DNS access should apply as well.
 */

/** Only these reach the network. `file:`, `gopher:` and friends do not. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Hostnames that must never be dialled regardless of how they resolve.
 *
 * `metadata.google.internal` and the AWS/GCP/Azure metadata IP are the high
 * value targets — they hand out credentials to anything that can make a plain
 * GET from inside the instance.
 */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
]);

/** IPv4 ranges that are not routable on the public internet. */
const BLOCKED_V4_RANGES: ReadonlyArray<{ readonly cidr: string; readonly why: string }> = [
  { cidr: '0.0.0.0/8', why: 'this host' },
  { cidr: '10.0.0.0/8', why: 'private' },
  { cidr: '100.64.0.0/10', why: 'carrier-grade NAT' },
  { cidr: '127.0.0.0/8', why: 'loopback' },
  { cidr: '169.254.0.0/16', why: 'link-local / cloud metadata' },
  { cidr: '172.16.0.0/12', why: 'private' },
  { cidr: '192.0.0.0/24', why: 'IETF protocol assignments' },
  { cidr: '192.168.0.0/16', why: 'private' },
  { cidr: '198.18.0.0/15', why: 'benchmarking' },
  { cidr: '224.0.0.0/4', why: 'multicast' },
  { cidr: '240.0.0.0/4', why: 'reserved' },
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return null;
  }
  let out = 0;
  for (const part of parts) {
    // Reject '01', '1e2', '' and anything non-numeric: `Number('')` is 0 and
    // `parseInt('1e2')` is 1, both of which would wave through a crafted host.
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const n = Number(part);
    if (n > 255) {
      return null;
    }
    out = out * 256 + n;
  }
  return out >>> 0;
}

function inCidr(ipInt: number, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  const baseInt = ipv4ToInt(base ?? '');
  if (baseInt === null) {
    return false;
  }
  // A /0 mask would shift by 32, which is a no-op in JS and would match
  // nothing. No range here uses /0, but the guard keeps that from being a
  // silent hole if one is added later.
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/** Strip the brackets Node keeps on IPv6 hostnames (`[::1]`). */
function normaliseHost(hostname: string): string {
  const lower = hostname.trim().toLowerCase().replace(/\.$/, '');
  return lower.startsWith('[') && lower.endsWith(']') ? lower.slice(1, -1) : lower;
}

/**
 * True when a bare address literal is one we refuse to dial.
 *
 * Exported so callers that CAN resolve DNS (the worker, via `dns.lookup`) can
 * re-check the resolved address and close the rebinding gap this module
 * cannot see on its own.
 */
export function isBlockedAddress(address: string): boolean {
  const host = normaliseHost(address);

  const v4 = ipv4ToInt(host);
  if (v4 !== null) {
    return BLOCKED_V4_RANGES.some((r) => inCidr(v4, r.cidr));
  }

  if (host.includes(':')) {
    // IPv4-mapped in DOTTED form (`::ffff:127.0.0.1`). Checked before the
    // expansion below because it is the shape a config file or a header
    // carries; `new URL()` never produces it.
    const dotted = /::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(host);
    if (dotted?.[1] !== undefined) {
      return isBlockedAddress(dotted[1]);
    }

    /*
     * Everything else goes through a real expansion rather than a prefix
     * match on the text.
     *
     * The text-matching version had a hole big enough to reach the cloud
     * metadata endpoint: `new URL('http://[::ffff:169.254.169.254]/')`
     * normalises its hostname to `[::ffff:a9fe:a9fe]`, the HEX form, which
     * the dotted-form regex above does not match and whose first hextet is
     * the empty string — so `f[cd]` and `fe[89ab]` did not match either and
     * the address was declared public. `http://[::ffff:a9fe:a9fe]/` was a
     * working SSRF primitive against `http_request`, AI custom tools and
     * anything else that trusts this function. Same for `[::ffff:7f00:1]`
     * (loopback) and `[::ffff:0a00:0005]` (RFC1918).
     */
    const hextets = expandIpv6(host);
    if (hextets === null) {
      // Not parseable as IPv6. Refusing is the safe direction: a host with a
      // colon in it that is not a valid address is not something to dial.
      return true;
    }
    const [h0, h1, h2, h3, h4, h5, h6, h7] = hextets;

    // `::` (unspecified) and `::1` (loopback).
    if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0 && h6 === 0) {
      return h7 === 0 || h7 === 1;
    }
    // fc00::/7 unique local, fe80::/10 link-local.
    if ((h0 & 0xfe00) === 0xfc00 || (h0 & 0xffc0) === 0xfe80) {
      return true;
    }
    // IPv4-mapped (`::ffff:a.b.c.d`) and the deprecated IPv4-compatible
    // (`::a.b.c.d`) both carry a v4 address in the low 32 bits.
    if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && (h5 === 0xffff || h5 === 0)) {
      const v4 = ((h6 << 16) | h7) >>> 0;
      return BLOCKED_V4_RANGES.some((r) => inCidr(v4, r.cidr));
    }
    // NAT64's well-known prefix 64:ff9b::/96 wraps a v4 address the same way.
    if (h0 === 0x0064 && h1 === 0xff9b && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0) {
      const v4 = ((h6 << 16) | h7) >>> 0;
      return BLOCKED_V4_RANGES.some((r) => inCidr(v4, r.cidr));
    }
    return false;
  }

  return false;
}

/**
 * Expand an IPv6 literal to its eight 16-bit groups, or null if it is not one.
 *
 * Written out rather than prefix-matched on the string because `::` can
 * elide any run of zero groups, so the same address has many spellings and
 * only one of them starts with the bytes a prefix check is looking for.
 */
function expandIpv6(
  input: string,
): [number, number, number, number, number, number, number, number] | null {
  // A zone id (`fe80::1%eth0`) is not part of the address.
  const host = input.split('%')[0] ?? '';
  if (host.length === 0 || !host.includes(':')) {
    return null;
  }
  // A trailing dotted quad (`::ffff:1.2.3.4`) becomes two hextets.
  const dottedTail = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host);
  let text = host;
  if (dottedTail?.[1] !== undefined && dottedTail[2] !== undefined) {
    const v4 = ipv4ToInt(dottedTail[2]);
    if (v4 === null) {
      return null;
    }
    text = `${dottedTail[1]}${((v4 >>> 16) & 0xffff).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) {
    return null;
  }
  const parse = (part: string): number[] | null => {
    if (part.length === 0) {
      return [];
    }
    const out: number[] = [];
    for (const group of part.split(':')) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
        return null;
      }
      out.push(Number.parseInt(group, 16));
    }
    return out;
  };

  const head = parse(halves[0] ?? '');
  if (head === null) {
    return null;
  }
  if (halves.length === 1) {
    return head.length === 8
      ? (head as [number, number, number, number, number, number, number, number])
      : null;
  }
  const tail = parse(halves[1] ?? '');
  if (tail === null) {
    return null;
  }
  const fill = 8 - head.length - tail.length;
  if (fill < 0) {
    return null;
  }
  const full = [...head, ...new Array<number>(fill).fill(0), ...tail];
  return full.length === 8
    ? (full as [number, number, number, number, number, number, number, number])
    : null;
}

export interface UrlGuardResult {
  readonly ok: boolean;
  /** Human-readable reason, safe to surface in a workflow trace. */
  readonly reason?: string;
}

/**
 * Check a customer-supplied URL before dialling it.
 *
 * Returns a result rather than throwing: `http_request` is documented never to
 * throw, and callers turn this into the same shaped soft failure as a timeout.
 */
export function checkOutboundUrl(raw: string): UrlGuardResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'not a valid absolute URL' };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, reason: `protocol ${url.protocol} is not allowed` };
  }

  const host = normaliseHost(url.hostname);
  if (host.length === 0) {
    return { ok: false, reason: 'missing host' };
  }
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost')) {
    return { ok: false, reason: `host ${host} is not allowed` };
  }
  // `.internal` covers metadata.google.internal and the convention generally;
  // `.local` is mDNS.
  if (host.endsWith('.internal') || host.endsWith('.local')) {
    return { ok: false, reason: `host ${host} is not allowed` };
  }
  if (isBlockedAddress(host)) {
    return { ok: false, reason: `address ${host} is private or reserved` };
  }

  return { ok: true };
}
