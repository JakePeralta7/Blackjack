'use strict';

const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const db = require('./db');
const {
  createDeck,
  handValue,
  isBlackjack,
  isBust,
  isPair,
  resolveHand,
  playDealer,
} = require('./game');

const app = express();
const PORT = process.env.PORT || 3000;
const STARTING_CHIPS = 1000;
const VALID_DECK_COUNTS = [1, 2, 6];

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

// ─── Validation helpers ───────────────────────────────────────────────────────

function validateDeckCount(req, res) {
  const dc = Number(req.body.deck_count ?? req.query.deck_count);
  if (!VALID_DECK_COUNTS.includes(dc)) {
    res.status(400).json({ error: `deck_count must be one of: ${VALID_DECK_COUNTS.join(', ')}` });
    return null;
  }
  return dc;
}

function requireSession(req, res) {
  const { session_id } = req.body;
  if (!session_id) {
    res.status(400).json({ error: 'session_id is required' });
    return null;
  }
  const session = db.getSession(session_id);
  if (!session) {
    res.status(404).json({ error: 'Session not found or expired' });
    return null;
  }
  return session;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return a sanitised view of the game state for the client.
 * Hides the dealer's hole card (index 1) during 'player_turn'.
 */
function clientState(session) {
  const s = session.state;
  const dealerVisible = s.phase === 'player_turn'
    ? [s.dealerCards[0], { rank: '?', suit: '?', value: 0, hidden: true }]
    : s.dealerCards;

  return {
    session_id: session.session_id,
    deck_count: session.deck_count,
    chips: session.chips,
    phase: s.phase,
    currentBet: s.currentBet,
    playerHands: s.playerHands,
    activeHandIndex: s.activeHandIndex,
    dealerCards: dealerVisible,
    dealerValue: s.phase === 'player_turn' ? handValue([s.dealerCards[0]]) : handValue(s.dealerCards),
    outcomes: s.outcomes ?? null,
  };
}

/**
 * After all player hands are settled, run dealer auto-play and resolve all hands.
 * Mutates `state` in place. Returns the updated state.
 */
function settleRound(state) {
  playDealer(state.dealerCards, state.shoe);

  let chipsDelta = 0;
  state.outcomes = state.playerHands.map((hand, i) => {
    const result = resolveHand(
      hand.cards,
      state.dealerCards,
      hand.bet,
      hand.doubled,
    );
    chipsDelta += result.chipDelta;
    return { handIndex: i, outcome: result.outcome, chipDelta: result.chipDelta };
  });

  state.chipsWon = chipsDelta;
  state.phase = 'resolved';
  return state;
}

/**
 * Advance to the next non-busted hand that still needs action.
 * If all hands are done, settle the round.
 */
function advanceHand(state) {
  const nextIndex = state.playerHands.findIndex(
    (h, i) => i > state.activeHandIndex && !h.done,
  );
  if (nextIndex !== -1) {
    state.activeHandIndex = nextIndex;
  } else {
    settleRound(state);
  }
  return state;
}

// ─── POST /api/session ────────────────────────────────────────────────────────

app.post('/api/session', (req, res) => {
  const deck_count = validateDeckCount(req, res);
  if (deck_count === null) return;

  const session_id = uuidv4();
  const shoe = createDeck(deck_count);

  const initialState = {
    shoe,
    phase: 'betting',
    currentBet: 0,
    playerHands: [],
    activeHandIndex: 0,
    dealerCards: [],
    outcomes: null,
    chipsWon: 0,
  };

  db.createSession(session_id, deck_count, STARTING_CHIPS, initialState);

  res.json({ session_id, deck_count, chips: STARTING_CHIPS });
});

// ─── GET /api/session/:id ─────────────────────────────────────────────────────

app.get('/api/session/:id', (req, res) => {
  const session = db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found or expired' });
  res.json(clientState(session));
});

// ─── POST /api/hand/deal ──────────────────────────────────────────────────────

app.post('/api/hand/deal', (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const bet = Number(req.body.bet);
  if (!Number.isInteger(bet) || bet < 1) {
    return res.status(400).json({ error: 'bet must be a positive integer' });
  }
  if (bet > session.chips) {
    return res.status(400).json({ error: 'Insufficient chips' });
  }
  if (session.state.phase !== 'betting') {
    return res.status(400).json({ error: 'Not in betting phase' });
  }

  const state = session.state;

  // Reshuffle shoe when running low (< 25% remaining)
  const totalCards = session.deck_count * 52;
  if (state.shoe.length < totalCards * 0.25) {
    const { createDeck: cd } = require('./game');
    state.shoe = cd(session.deck_count);
  }

  // Deal 2 cards each (player, dealer, player, dealer)
  const playerCard1 = state.shoe.pop();
  const dealerCard1 = state.shoe.pop();
  const playerCard2 = state.shoe.pop();
  const dealerCard2 = state.shoe.pop();

  state.playerHands = [{
    cards: [playerCard1, playerCard2],
    bet,
    doubled: false,
    done: false,
  }];
  state.dealerCards = [dealerCard1, dealerCard2];
  state.activeHandIndex = 0;
  state.outcomes = null;
  state.chipsWon = 0;
  state.currentBet = bet;

  // Deduct bet immediately
  const newChips = session.chips - bet;

  // Check for immediate player blackjack (dealer might also have one → push)
  const playerHand = state.playerHands[0];
  if (isBlackjack(playerHand.cards)) {
    settleRound(state); // dealer reveals, resolve
    const finalChips = newChips + (state.chipsWon ?? 0);
    db.updateSession(session.session_id, finalChips, state);
    return res.json(clientState({ ...session, chips: finalChips, state }));
  }

  state.phase = 'player_turn';
  db.updateSession(session.session_id, newChips, state);

  res.json(clientState({ ...session, chips: newChips, state }));
});

// ─── POST /api/hand/action ────────────────────────────────────────────────────

app.post('/api/hand/action', (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  const { action } = req.body;
  const VALID_ACTIONS = ['hit', 'stand', 'double', 'split'];
  if (!VALID_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `action must be one of: ${VALID_ACTIONS.join(', ')}` });
  }
  if (session.state.phase !== 'player_turn') {
    return res.status(400).json({ error: 'Not in player_turn phase' });
  }

  const state = session.state;
  let chips = session.chips;
  const hand = state.playerHands[state.activeHandIndex];

  if (!hand || hand.done) {
    return res.status(400).json({ error: 'No active hand to act on' });
  }

  if (action === 'hit') {
    hand.cards.push(state.shoe.pop());
    if (isBust(hand.cards) || handValue(hand.cards) === 21) {
      hand.done = true;
      advanceHand(state);
      if (state.phase === 'resolved') {
        chips += state.chipsWon ?? 0;
      }
    }

  } else if (action === 'stand') {
    hand.done = true;
    advanceHand(state);
    if (state.phase === 'resolved') {
      chips += state.chipsWon ?? 0;
    }

  } else if (action === 'double') {
    if (hand.cards.length !== 2) {
      return res.status(400).json({ error: 'Can only double on first two cards' });
    }
    if (chips < hand.bet) {
      return res.status(400).json({ error: 'Insufficient chips to double down' });
    }
    chips -= hand.bet; // deduct extra bet
    hand.doubled = true;
    hand.cards.push(state.shoe.pop());
    hand.done = true;
    advanceHand(state);
    if (state.phase === 'resolved') {
      chips += state.chipsWon ?? 0;
    }

  } else if (action === 'split') {
    if (!isPair(hand.cards)) {
      return res.status(400).json({ error: 'Can only split a pair' });
    }
    if (hand.cards.length !== 2) {
      return res.status(400).json({ error: 'Can only split original two cards' });
    }
    if (chips < hand.bet) {
      return res.status(400).json({ error: 'Insufficient chips to split' });
    }
    chips -= hand.bet; // second hand costs same as first

    const [card1, card2] = hand.cards;
    // Replace current hand with just card1, add new hand with card2
    hand.cards = [card1, state.shoe.pop()];
    hand.done = false;
    const newHand = {
      cards: [card2, state.shoe.pop()],
      bet: hand.bet,
      doubled: false,
      done: false,
    };
    state.playerHands.splice(state.activeHandIndex + 1, 0, newHand);
  }

  db.updateSession(session.session_id, chips, state);
  res.json(clientState({ ...session, chips, state }));
});

// ─── POST /api/hand/new ───────────────────────────────────────────────────────

/** Move back to betting phase for the next hand within the same session. */
app.post('/api/hand/new', (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  if (session.state.phase !== 'resolved') {
    return res.status(400).json({ error: 'Round not yet resolved' });
  }

  if (session.chips <= 0) {
    return res.status(400).json({ error: 'No chips remaining — cash out to end session' });
  }

  const state = session.state;
  state.phase = 'betting';
  state.currentBet = 0;
  state.playerHands = [];
  state.activeHandIndex = 0;
  state.dealerCards = [];
  state.outcomes = null;
  state.chipsWon = 0;

  db.updateSession(session.session_id, session.chips, state);
  res.json(clientState({ ...session, state }));
});

// ─── DELETE /api/session/:id ────────────────────────────────────────────────────

/** Discard a session without saving a score (e.g. bust-out / play again). */
app.delete('/api/session/:id', (req, res) => {
  const session = db.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  db.deleteSession(req.params.id);
  res.status(204).end();
});

// ─── POST /api/cashout ────────────────────────────────────────────────────────

app.post('/api/cashout', (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;

  let player_name = (req.body.player_name || '').toString().trim();
  if (!player_name) {
    return res.status(400).json({ error: 'player_name is required' });
  }
  player_name = player_name.slice(0, 32);

  db.saveScore(player_name, session.chips, session.deck_count);
  db.deleteSession(session.session_id);

  res.status(201).json({ message: 'Score saved.' });
});

// ─── GET /api/leaderboard ─────────────────────────────────────────────────────

app.get('/api/leaderboard', (req, res) => {
  const dc = Number(req.query.deck_count);
  if (!VALID_DECK_COUNTS.includes(dc)) {
    return res.status(400).json({ error: `deck_count must be one of: ${VALID_DECK_COUNTS.join(', ')}` });
  }

  const scores = db.getLeaderboard(dc);
  res.json({ deck_count: dc, scores });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Blackjack server listening on http://localhost:${PORT}`);
});
