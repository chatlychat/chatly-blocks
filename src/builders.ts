import type {
  Action,
  Block,
  BlockEnvelope,
  Card,
  CardBody,
  CardGridBlock,
  CopyAction,
  HostEventAction,
  NavigateAction,
  PostbackAction,
  QuickRepliesBlock,
  StepAction,
  UrlAction,
} from './types.js';

/*
 * Builders are typed object literals and nothing more: they add no defaults
 * and no checks, so what you build is exactly what `validate` sees. Anything
 * a builder here does not cover is still a plain object of the right type.
 */

type Rest<T, K extends keyof T> = Omit<T, 'kind' | 'type' | K>;

export const action = {
  url: (label: string, href: string, rest: Rest<UrlAction, 'label' | 'href'> = {}): UrlAction => ({
    kind: 'url',
    label,
    href,
    ...rest,
  }),
  postback: (
    label: string,
    value: string,
    rest: Rest<PostbackAction, 'label' | 'value'> = {},
  ): PostbackAction => ({ kind: 'postback', label, value, ...rest }),
  hostEvent: (
    label: string,
    event: string,
    rest: Rest<HostEventAction, 'label' | 'event'> = {},
  ): HostEventAction => ({ kind: 'host_event', label, event, ...rest }),
  step: (
    label: string,
    canvasId: string,
    rest: Rest<StepAction, 'label' | 'canvasId'> = {},
  ): StepAction => ({ kind: 'step', label, canvasId, ...rest }),
  navigate: (
    label: string,
    path: string,
    rest: Rest<NavigateAction, 'label' | 'path'> = {},
  ): NavigateAction => ({ kind: 'navigate', label, path, ...rest }),
  copy: (
    label: string,
    text: string,
    rest: Rest<CopyAction, 'label' | 'text'> = {},
  ): CopyAction => ({
    kind: 'copy',
    label,
    text,
    ...rest,
  }),
};

export const block = {
  text: (markdown: string): Block => ({ type: 'text', markdown }),
  card: (title: string, rest: Omit<CardBody, 'title'> = {}): Card => ({
    type: 'card',
    title,
    ...rest,
  }),
  cardGrid: (
    cards: CardBody[],
    rest: Omit<CardGridBlock, 'type' | 'cards'> = {},
  ): CardGridBlock => ({
    type: 'card_grid',
    cards,
    ...rest,
  }),
  actions: (actions: Action[]): Block => ({ type: 'actions', actions }),
  quickReplies: (
    options: QuickRepliesBlock['options'],
    rest: Omit<QuickRepliesBlock, 'type' | 'options'> = {},
  ): QuickRepliesBlock => ({ type: 'quick_replies', options, ...rest }),
  status: (id: string, text: string, done?: boolean): Block => ({
    type: 'status',
    id,
    text,
    ...(done === undefined ? {} : { done }),
  }),
  divider: (): Block => ({ type: 'divider' }),
};

/** `{ v: 1, blocks }`. */
export function envelope(...blocks: Block[]): BlockEnvelope {
  return { v: 1, blocks };
}
