# @chatlychat/blocks

## 0.2.0 — 2026-10-26

- `navigate` is accepted as a card's tap target and as a grid's `more` tile: `CardTapAction` and `PagingAction` gain `NavigateAction` (`card.action: action.navigate('Pricing', '/pricing')`).
- `ref` on `card` and on cards inside `card_grid`: a stable string the bot owns (1-128 of `[A-Za-z0-9:._-]`), used by `PATCH /v1/bot/cards?ref=` to revise every card carrying it across conversations. `block.card('T', { ref: 'listing:123' })`.

## 0.1.0 — 2026-10-26

First release.

- Block, card and action types as discriminated unions (`Block` on `type`, `Action` on `kind`).
- Builders: `envelope`, `block.*`, `action.*`.
- `validate(envelope)` returns `{ path, reason }[]`, empty when the API would accept it. It runs the API's own schema, bundled into the package with zod, so the package has no dependencies and cannot drift from the server.
- `LIMITS` and `HOST_EVENT_NAME_RE`, the caps and the event-name pattern the API enforces.
