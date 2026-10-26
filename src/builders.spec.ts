import { describe, expect, it } from 'vitest';

import { action, block, envelope } from './builders.js';
import { formatPath, validate } from './validate.js';

describe('builders', () => {
  it('build an envelope the server accepts', () => {
    const msg = envelope(
      block.text('Pick one'),
      block.cardGrid([
        {
          title: 'Boots',
          price: { amount: 4820, currency: 'USD' },
          actions: [
            action.postback('Buy', 'buy', { silent: true }),
            action.url('Details', 'https://example.com/boots', { target: 'self' }),
            action.hostEvent('Add', 'cart.add', { data: { sku: 'b1' } }),
            action.step('Checkout', 'checkout'),
            action.navigate('Pricing', '/pricing?plan=pro'),
            action.copy('Code', 'SAVE10'),
          ],
        },
      ]),
      block.quickReplies([{ label: 'Under $50', value: 'under_50' }]),
      block.status('s1', 'Working'),
      block.divider(),
    );
    expect(validate(msg)).toEqual([]);
  });
});

describe('validate', () => {
  it('names where a problem is', () => {
    const issues = validate(
      envelope(
        block.text('ok'),
        block.card('Boots', { actions: [action.hostEvent('x', 'Bad Name')] }),
      ),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.path).toBe('blocks[1].actions[0].event');
  });
  it('formats paths', () => {
    expect(formatPath([])).toBe('');
    expect(formatPath(['blocks', 0, 'cards', 2, 'title'])).toBe('blocks[0].cards[2].title');
  });
});
