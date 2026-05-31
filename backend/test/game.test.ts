'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  handValue,
  isBlackjack,
  isBust,
  isSoft17,
  isPair,
  dealerShouldHit,
  resolveHand,
  playDealer,
} = require('../game');

const A = { rank: 'A', suit: '♠', value: 1 };
const TEN = { rank: '10', suit: '♥', value: 10 };
const NINE = { rank: '9', suit: '♦', value: 9 };
const EIGHT = { rank: '8', suit: '♣', value: 8 };
const SEVEN = { rank: '7', suit: '♠', value: 7 };
const SIX = { rank: '6', suit: '♦', value: 6 };
const FIVE = { rank: '5', suit: '♣', value: 5 };

test('handValue promotes aces only when safe', () => {
  assert.equal(handValue([A, NINE]), 20);
  assert.equal(handValue([A, A, NINE]), 21);
  assert.equal(handValue([A, TEN, TEN]), 21);
});

test('hand classification helpers reflect blackjack rules', () => {
  assert.equal(isBlackjack([A, TEN]), true);
  assert.equal(isBust([TEN, TEN, SEVEN]), true);
  assert.equal(isSoft17([A, SIX]), true);
  assert.equal(isPair([TEN, { rank: 'K', suit: '♣', value: 10 }]), true);
});

test('dealerShouldHit follows soft 17 behavior', () => {
  assert.equal(dealerShouldHit([A, SIX]), true);
  assert.equal(dealerShouldHit([TEN, SEVEN]), false);
});

test('resolveHand returns expected outcomes', () => {
  assert.deepEqual(resolveHand([A, TEN], [TEN, NINE], 100), { outcome: 'blackjack', chipDelta: 250 });
  assert.deepEqual(resolveHand([TEN, TEN], [TEN, TEN, EIGHT], 50), { outcome: 'win', chipDelta: 100 });
  assert.deepEqual(resolveHand([TEN, NINE], [TEN, NINE], 25), { outcome: 'push', chipDelta: 25 });
});

test('playDealer draws until standing total', () => {
  const dealer = [TEN, SIX];
  const shoe = [FIVE, NINE];

  playDealer(dealer, shoe);

  assert.equal(handValue(dealer) >= 17, true);
  assert.equal(shoe.length, 1);
});