# @chatlychat/blocks

Build and check Chatly block envelopes (cards, grids, actions) in TypeScript.
Isomorphic, zero runtime dependencies.

```bash
npm install @chatlychat/blocks
```

```ts
import { action, block, envelope, validate } from '@chatlychat/blocks';

const message = envelope(
  block.text('Two good options:'),
  block.cardGrid([
    {
      title: 'Trail boots',
      price: { amount: 14900, currency: 'USD' },
      actions: [
        action.postback('Pick this', 'buy:boots'),
        action.url('Details', 'https://example.com/boots'),
      ],
    },
  ]),
);

const problems = validate(message); // [] when the API would accept it
// [{ path: 'blocks[1].cards[0].actions[0].label', reason: 'String must contain at most 40 character(s)' }]
```

- **Types** — `Block`, `Card`, `CardBody`, `Action` (and each kind), `BlockEnvelope`, `Issue`.
- **Builders** — typed object literals; they add no defaults, so what you build is what `validate` sees.
- **`validate(input)`** — everything the server would refuse, with a path like `blocks[2].cards[0].title` (`''` is the envelope itself).
- **`LIMITS`**, **`HOST_EVENT_NAME_RE`** — the caps and the event-name pattern.

## Why it cannot drift from the server

`validate` is not a port. The API validates with zod schemas in its shared
package; this package's build bundles those same schemas (and zod) into
`dist/index.js`. A spec runs a corpus of valid and invalid envelopes through the
source, the built file and the schema itself, and requires identical verdicts and
paths. The corpus includes every action kind found in the schema, so a new kind is
covered without anyone listing it. The hand-written types are held to the schema's
inferred types at compile time.

Reference: the block vocabulary is documented in full at `/docs/api-blocks`.

---

## About this repository

This is a **mirror**. `@chatlychat/blocks` is built from a private monorepo where the rest
of the platform, its migrations and its contract checks live, so a pull request here
cannot be merged directly — but a patch is still the fastest way to get something
fixed and we will port it with attribution.

What you can do here: read the source, run the tests, open an issue, or open a PR
and we will treat the diff as the proposal.

Not mirrored: src/core-types-parity.spec.ts, src/parity.spec.ts — specs that assert a type restated here still
matches the monorepo's original, which is only a meaningful claim inside it. They
keep running there.

Issues: https://github.com/chatlychat/chatly-blocks/issues · Docs: https://chatlychat.com/docs
