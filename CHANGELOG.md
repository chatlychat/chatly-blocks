# @chatlychat/blocks

## 0.4.0 — 2026-10-28

- **The `cards` action.** `CardsAction` — a button that asks the operator's own backend for this visitor's data and posts the answer into the thread. `cardKey` NAMES a card registered under `POST /v1/customer-cards`, and only one the operator marked `visitorVisible`; it is a selector, never a URL or a path, so a bot cannot author a button that makes Chatly fetch an arbitrary address. `action.cards('My orders', 'orders')`.

  Accepted on a button, NOT as a card's tap target: `CardTapAction` is unchanged. A card body tap is an affordance a visitor triggers by brushing past it, and a request to somebody's backend should be a press with a label on it.

## 0.3.0 — 2026-10-27

- **The `sources` block.** `SourcesBlock` — the help articles an AI answer drew on, as `items: { title, url? }[]`. `url` is optional and that is the feature rather than a gap: an article can ground an answer without being published (a crawled page, an uploaded PDF), and then there is nowhere to send the reader. A title with no link is the honest render; a dashboard URL would be a sign-in page for the person being told to go and read it.

## 0.2.0 — 2026-10-26

- `navigate` is accepted as a card's tap target and as a grid's `more` tile: `CardTapAction` and `PagingAction` gain `NavigateAction` (`card.action: action.navigate('Pricing', '/pricing')`).
- `ref` on `card` and on cards inside `card_grid`: a stable string the bot owns (1-128 of `[A-Za-z0-9:._-]`), used by `PATCH /v1/bot/cards?ref=` to revise every card carrying it across conversations. `block.card('T', { ref: 'listing:123' })`.

## 0.1.0 — 2026-10-26

First release.

- Block, card and action types as discriminated unions (`Block` on `type`, `Action` on `kind`).
- Builders: `envelope`, `block.*`, `action.*`.
- `validate(envelope)` returns `{ path, reason }[]`, empty when the API would accept it. It runs the API's own schema, bundled into the package with zod, so the package has no dependencies and cannot drift from the server.
- `LIMITS` and `HOST_EVENT_NAME_RE`, the caps and the event-name pattern the API enforces.
