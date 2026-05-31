'use strict';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/**
 * Build and return a fresh shuffled deck of `count` x 52 cards.
 * Each card: { suit, rank, value }  (value is the numeric base value; aces = 1)
 */
function createDeck(count = 1) {
  const deck = [];
  for (let d = 0; d < count; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const value = rank === 'A' ? 1 : ['J', 'Q', 'K'].includes(rank) ? 10 : parseInt(rank, 10);
        deck.push({ suit, rank, value });
      }
    }
  }
  return shuffleDeck(deck);
}

/** Fisher-Yates shuffle — mutates and returns deck. */
function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Compute best (highest non-bust) total for a hand.
 * Aces start as 1 then get promoted to 11 one at a time when safe.
 */
function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += card.value;
    if (card.rank === 'A') aces++;
  }
  while (aces > 0 && total + 10 <= 21) {
    total += 10;
    aces--;
  }
  return total;
}

/** True when the hand contains exactly 2 cards, one of which is an A, totalling 21. */
function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards) === 21;
}

/** True when the hand total exceeds 21. */
function isBust(cards) {
  return handValue(cards) > 21;
}

/**
 * True when the dealer hand is a "soft 17":
 * an ace still counted as 11 making the total exactly 17.
 */
function isSoft17(cards) {
  const hardTotal = cards.reduce((s, c) => s + c.value, 0);
  return handValue(cards) === 17 && hardTotal !== 17;
}

/**
 * True when a 2-card hand is a splittable pair
 * (same rank, or any two 10-value cards).
 */
function isPair(cards) {
  if (cards.length !== 2) return false;
  return cards[0].value === cards[1].value;
}

/**
 * Return true when the dealer must draw another card.
 * Rule: hit on 16 or below; hit on soft 17; stand otherwise.
 */
function dealerShouldHit(cards) {
  const val = handValue(cards);
  if (val < 17) return true;
  if (val === 17 && isSoft17(cards)) return true;
  return false;
}

/**
 * Compute the outcome of a single player hand against the dealer.
 *
 * @param {object[]} playerCards
 * @param {object[]} dealerCards
 * @param {number}   bet           original bet (already deducted from chips)
 * @param {boolean}  isDoubled     true when the player doubled down
 * @returns {{ outcome: string, chipDelta: number }}
 *   outcome: 'blackjack' | 'win' | 'push' | 'lose' | 'bust'
 *   chipDelta: net change in chips (positive = profit, negative = loss; includes bet return)
 */
function resolveHand(playerCards, dealerCards, bet, isDoubled = false) {
  const effectiveBet = isDoubled ? bet * 2 : bet;
  const playerVal = handValue(playerCards);
  const dealerVal = handValue(dealerCards);

  if (isBust(playerCards)) {
    return { outcome: 'bust', chipDelta: 0 }; // already deducted
  }

  if (isBlackjack(playerCards) && !isBlackjack(dealerCards)) {
    // 3:2 payout — chipDelta includes stake back + profit
    return { outcome: 'blackjack', chipDelta: effectiveBet + Math.floor(effectiveBet * 1.5) };
  }

  if (isBlackjack(dealerCards) && !isBlackjack(playerCards)) {
    return { outcome: 'lose', chipDelta: 0 }; // stake already deducted, no return
  }

  if (isBust(dealerCards) || playerVal > dealerVal) {
    return { outcome: 'win', chipDelta: effectiveBet * 2 }; // stake back + equal profit
  }

  if (playerVal === dealerVal) {
    return { outcome: 'push', chipDelta: effectiveBet }; // return stake only
  }

  return { outcome: 'lose', chipDelta: 0 };
}

/**
 * Run the dealer's automatic play-out given a visible deck (remaining shoe).
 * Mutates `dealerCards` by pushing drawn cards from `shoe`.
 * Returns the final dealer hand.
 */
function playDealer(dealerCards, shoe) {
  while (dealerShouldHit(dealerCards) && shoe.length > 0) {
    dealerCards.push(shoe.pop());
  }
  return dealerCards;
}

module.exports = {
  createDeck,
  shuffleDeck,
  handValue,
  isBlackjack,
  isBust,
  isSoft17,
  isPair,
  dealerShouldHit,
  resolveHand,
  playDealer,
};
