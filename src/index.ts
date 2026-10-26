/**
 * `@chatlychat/blocks` -- build and check Chatly block envelopes.
 *
 *   const msg = envelope(block.text('Pick one'), block.card('Boots', { price: { amount: 4820, currency: 'USD' } }));
 *   const problems = validate(msg); // [] when the server would accept it
 */
export * from './types.js';
export * from './builders.js';
export { HOST_EVENT_NAME_RE, LIMITS, formatPath, validate } from './validate.js';
