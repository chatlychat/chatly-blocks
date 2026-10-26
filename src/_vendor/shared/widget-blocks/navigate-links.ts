/**
 * Every `navigate` action in a stored block envelope, as `{ label, path }`.
 *
 * For the surfaces with no page of their own to navigate (the e-mail
 * transcript, the agent inbox's plain rendition) that must show WHERE a
 * visitor was offered a way to go. Read through the lenient reader and
 * re-checked with `isSafeNavigatePath`, so a malformed stored row yields
 * nothing rather than a bad link in a customer's mailbox.
 */
import { isSafeNavigatePath } from './href-guard.js';
import { readBlocksEnvelope } from './read-envelope.js';

import type { WidgetAction } from './actions.js';

export interface NavigateLink {
  readonly label: string;
  readonly path: string;
}

export function navigateLinks(blocks: unknown): NavigateLink[] {
  const envelope = readBlocksEnvelope(blocks);
  const out: NavigateLink[] = [];
  const take = (action: WidgetAction | undefined): void => {
    if (action?.kind === 'navigate' && isSafeNavigatePath(action.path)) {
      out.push({ label: action.label, path: action.path });
    }
  };
  const takeCard = (card: { actions?: readonly WidgetAction[]; action?: WidgetAction }): void => {
    card.actions?.forEach(take);
    take(card.action);
  };
  for (const block of envelope?.blocks ?? []) {
    if (block.type === 'actions') {
      block.actions.forEach(take);
    } else if (block.type === 'card') {
      takeCard(block);
    } else if (block.type === 'card_grid') {
      block.cards.forEach(takeCard);
      take(block.more?.action);
    }
  }
  return out;
}
