# @chatlychat/blocks

## 0.1.0 — 2026-10-26

First release (not yet published).

- Block, card and action types as discriminated unions (`Block` on `type`, `Action` on `kind`).
- Builders: `envelope`, `block.*`, `action.*`.
- `validate(envelope)` returns `{ path, reason }[]`, empty when the API would accept it. It runs the API's own schema, bundled into the package with zod, so the package has no dependencies and cannot drift from the server.
- `LIMITS` and `HOST_EVENT_NAME_RE`, the caps and the event-name pattern the API enforces.
