'use strict';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const elChips         = document.getElementById('chips');
const elCurrentBet    = document.getElementById('current-bet');
const elDealerCards   = document.getElementById('dealer-cards');
const elDealerValue   = document.getElementById('dealer-value');
const elPlayerCards   = document.getElementById('player-cards');
const elPlayerValue   = document.getElementById('player-value');
const elBettingPanel  = document.getElementById('betting-panel');
const elActionBar     = document.getElementById('action-bar');
const elTableOverlay  = document.getElementById('table-overlay');
const elOverlayContent= document.getElementById('overlay-content');
const elBtnDeal       = document.getElementById('btn-deal');
const elBtnClearBet   = document.getElementById('btn-clear-bet');
const elBtnHit        = document.getElementById('btn-hit');
const elBtnStand      = document.getElementById('btn-stand');
const elBtnDouble     = document.getElementById('btn-double');
const elBtnSplit      = document.getElementById('btn-split');
const elBtnOverlayNew = document.getElementById('btn-overlay-new');
const elBtnLeaderboard= document.getElementById('btn-leaderboard');
const elBtnTheme      = document.getElementById('btn-theme');
const elBtnCashout    = document.getElementById('btn-cashout');
const elDeckSelector  = document.getElementById('deck-selector');
const elModalLB       = document.getElementById('modal-leaderboard');
const elModalScore    = document.getElementById('modal-score');
const elModalBackdrop = document.getElementById('modal-backdrop');
const elLBContent     = document.getElementById('leaderboard-content');
const elScoreForm     = document.getElementById('score-form');
const elPlayerName    = document.getElementById('player-name');
const elBtnCloseLB    = document.getElementById('btn-close-leaderboard');
const elBtnSkipScore  = document.getElementById('btn-skip-score');
const elCashoutSummary= document.getElementById('cashout-summary');

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  sessionId: null,
  deckCount: 1,
  chips: 1000,
  pendingBet: 0,
  playerHands: [],
  activeHandIndex: 0,
  dealerCards: [],
  dealerValue: 0,
  phase: 'betting',          // 'betting' | 'player_turn' | 'resolved'
  outcomes: null,
  chipsWon: 0,
};

// ── Theme ─────────────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('bj_theme') || 'auto';
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('bj_theme', theme);
  elBtnTheme.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function cycleTheme() {
  const current = localStorage.getItem('bj_theme') || 'auto';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function suitColor(suit) {
  return (suit === '♥' || suit === '♦') ? 'red' : 'black';
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Card rendering ────────────────────────────────────────────────────────────
function makeCardEl(card) {
  const el = document.createElement('div');
  if (card.hidden) {
    el.className = 'card face-down';
    return el;
  }
  el.className = `card ${suitColor(card.suit)}`;
  el.innerHTML = `<span class="card-rank">${escHtml(card.rank)}</span><span class="card-suit">${escHtml(card.suit)}</span>`;
  return el;
}

// ── Render ─────────────────────────────────────────────────────────────────────
function renderUI() {
  elChips.textContent = state.chips.toLocaleString();
  elCurrentBet.textContent = state.pendingBet.toLocaleString();

  // Dealer
  elDealerCards.innerHTML = '';
  for (const card of state.dealerCards) {
    elDealerCards.appendChild(makeCardEl(card));
  }
  elDealerValue.textContent = state.dealerValue > 0 ? state.dealerValue : '';

  // Player — one or more hands
  elPlayerCards.innerHTML = '';
  if (state.playerHands.length === 0) {
    elPlayerValue.textContent = '';
  } else if (state.playerHands.length === 1) {
    // single hand — inline in player area
    const hand = state.playerHands[0];
    for (const card of hand.cards) {
      elPlayerCards.appendChild(makeCardEl(card));
    }
    elPlayerValue.textContent = hand.value > 0 ? hand.value : '';
    if (state.phase === 'resolved' && state.outcomes) {
      const outcome = state.outcomes[0];
      if (outcome) {
        const badge = document.createElement('span');
        badge.className = `outcome-badge ${outcome.outcome}`;
        badge.textContent = outcomeLabel(outcome.outcome);
        elPlayerCards.appendChild(badge);
      }
    }
  } else {
    // multiple hands (split)
    elPlayerValue.textContent = '';
    for (let i = 0; i < state.playerHands.length; i++) {
      const hand = state.playerHands[i];
      const group = document.createElement('div');
      group.className = `hand-group${i === state.activeHandIndex && state.phase === 'player_turn' ? ' active-hand' : ''}`;

      const subLabel = document.createElement('div');
      subLabel.className = 'player-sub-label';
      subLabel.innerHTML = `Hand ${i + 1} <span class="hand-value">${hand.value > 0 ? hand.value : ''}</span>`;

      if (state.phase === 'resolved' && state.outcomes) {
        const outcome = state.outcomes.find(o => o.handIndex === i);
        if (outcome) {
          const badge = document.createElement('span');
          badge.className = `outcome-badge ${outcome.outcome}`;
          badge.textContent = outcomeLabel(outcome.outcome);
          subLabel.appendChild(badge);
        }
      }

      const cardsRow = document.createElement('div');
      cardsRow.className = 'hand-cards';
      for (const card of hand.cards) {
        cardsRow.appendChild(makeCardEl(card));
      }

      group.appendChild(subLabel);
      group.appendChild(cardsRow);
      elPlayerCards.appendChild(group);
    }
  }

  renderPhaseUI();
}

function outcomeLabel(outcome) {
  const map = { blackjack: 'Blackjack!', win: 'Win', lose: 'Lose', push: 'Push', bust: 'Bust' };
  return map[outcome] || outcome;
}

function renderPhaseUI() {
  if (state.phase === 'betting') {
    elBettingPanel.classList.remove('hidden');
    elActionBar.classList.add('hidden');
    elTableOverlay.classList.add('hidden');

    // Disable chips that would exceed current chips
    document.querySelectorAll('.chip-btn').forEach(btn => {
      const amount = parseInt(btn.dataset.amount, 10);
      btn.disabled = (state.pendingBet + amount > state.chips);
    });
    elBtnDeal.disabled = state.pendingBet === 0 || state.pendingBet > state.chips;

    // Deck selector only available in betting phase
    elDeckSelector.querySelectorAll('.deck-btn').forEach(btn => {
      btn.disabled = false;
    });

    const hasMoreThanStart = state.chips !== 1000;
    elBtnCashout.classList.toggle('hidden', !hasMoreThanStart && state.chips === 1000);
    if (state.chips > 0) elBtnCashout.classList.remove('hidden');
    else elBtnCashout.classList.add('hidden');

  } else if (state.phase === 'player_turn') {
    elBettingPanel.classList.add('hidden');
    elActionBar.classList.remove('hidden');
    elTableOverlay.classList.add('hidden');

    // Disable deck selector mid-hand
    elDeckSelector.querySelectorAll('.deck-btn').forEach(btn => btn.disabled = true);

    const hand = state.playerHands[state.activeHandIndex];
    if (hand) {
      elBtnDouble.disabled = hand.cards.length !== 2 || state.chips < hand.bet;
      elBtnSplit.disabled  = !canSplit(hand);
    }

  } else if (state.phase === 'resolved') {
    elBettingPanel.classList.add('hidden');
    elActionBar.classList.add('hidden');

    // Show overlay with outcome summary
    showResultOverlay();

    elDeckSelector.querySelectorAll('.deck-btn').forEach(btn => btn.disabled = false);
  }
}

function canSplit(hand) {
  if (!hand || hand.cards.length !== 2) return false;
  return hand.cards[0].value === hand.cards[1].value && state.chips >= hand.bet;
}

function showResultOverlay() {
  elOverlayContent.innerHTML = '';

  if (state.outcomes && state.outcomes.length > 0) {
    let totalDelta = 0;
    for (const o of state.outcomes) {
      totalDelta += o.chipDelta;
    }

    const primaryOutcome = state.outcomes.length === 1 ? state.outcomes[0].outcome : null;

    const resultEl = document.createElement('div');
    resultEl.className = 'overlay-result';
    if (primaryOutcome) {
      const labels = { blackjack: 'Blackjack! 🎉', win: 'You Win! 🎉', lose: 'You Lose', push: 'Push', bust: 'Bust' };
      resultEl.textContent = labels[primaryOutcome] || primaryOutcome;
    } else {
      const wins = state.outcomes.filter(o => o.outcome === 'win' || o.outcome === 'blackjack').length;
      const losses = state.outcomes.filter(o => o.outcome === 'lose' || o.outcome === 'bust').length;
      resultEl.textContent = wins > losses ? 'You Win! 🎉' : wins < losses ? 'You Lose' : 'Push';
    }

    // Calculate the actual net gain/loss: chipDelta – (bets already deducted)
    // totalDelta already represents money returned, we need net vs amount wagered
    const totalBet = state.playerHands.reduce((s, h) => s + h.bet * (h.doubled ? 2 : 1), 0);
    const netChange = totalDelta - totalBet;

    const chipsEl = document.createElement('div');
    chipsEl.className = 'overlay-chips';
    const sign = netChange > 0 ? '+' : '';
    chipsEl.textContent = `${sign}${netChange.toLocaleString()} chips  (${state.chips.toLocaleString()} total)`;

    elOverlayContent.appendChild(resultEl);
    elOverlayContent.appendChild(chipsEl);
  }

  // Show "New Hand" or "Cash Out" depending on chips
  elBtnOverlayNew.textContent = state.chips > 0 ? 'New Hand' : 'Game Over';
  elBtnOverlayNew.disabled = false;

  elTableOverlay.classList.remove('hidden');
}

// ── Apply server response ──────────────────────────────────────────────────────
function applyServerState(data) {
  state.chips           = data.chips;
  state.phase           = data.phase;
  state.dealerCards     = data.dealerCards;
  state.dealerValue     = data.dealerValue;
  state.playerHands     = (data.playerHands || []).map(h => ({
    cards: h.cards,
    bet: h.bet,
    doubled: h.doubled,
    done: h.done,
    value: computeValue(h.cards),
  }));
  state.activeHandIndex = data.activeHandIndex;
  state.outcomes        = data.outcomes;
  state.chipsWon        = data.chipsWon ?? 0;

  persistState();
  renderUI();
}

function computeValue(cards) {
  if (!cards || cards.length === 0) return 0;
  // Mirror server logic for display purposes
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c.hidden) continue;
    total += c.value;
    if (c.rank === 'A') aces++;
  }
  while (aces > 0 && total + 10 <= 21) { total += 10; aces--; }
  return total;
}

// ── Persist / restore ─────────────────────────────────────────────────────────
function persistState() {
  localStorage.setItem('bj_sessionId', state.sessionId || '');
  localStorage.setItem('bj_deckCount', String(state.deckCount));
}

function clearSavedSession() {
  localStorage.removeItem('bj_sessionId');
  localStorage.removeItem('bj_deckCount');
}

async function tryResumeSession() {
  const savedId = localStorage.getItem('bj_sessionId');
  if (!savedId) return false;
  try {
    const res = await fetch(`/api/session/${savedId}`);
    if (!res.ok) { clearSavedSession(); return false; }
    const data = await res.json();
    state.sessionId = savedId;
    state.deckCount = data.deck_count;
    state.pendingBet = data.currentBet || 0;
    syncDeckButtons();
    applyServerState(data);
    return true;
  } catch {
    clearSavedSession();
    return false;
  }
}

// ── Session creation ──────────────────────────────────────────────────────────
async function startNewSession(deckCount) {
  try {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deck_count: deckCount }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const data = await res.json();
    state.sessionId = data.session_id;
    state.deckCount = data.deck_count;
    state.chips = data.chips;
    state.pendingBet = 0;
    state.playerHands = [];
    state.dealerCards = [];
    state.dealerValue = 0;
    state.phase = 'betting';
    state.outcomes = null;
    persistState();
    renderUI();
  } catch (err) {
    alert(`Failed to start session: ${err.message}`);
  }
}

// ── Deal ──────────────────────────────────────────────────────────────────────
async function deal() {
  if (state.pendingBet === 0 || !state.sessionId) return;
  try {
    const res = await fetch('/api/hand/deal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: state.sessionId, bet: state.pendingBet }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const data = await res.json();
    state.pendingBet = 0;
    applyServerState(data);
  } catch (err) {
    alert(`Deal failed: ${err.message}`);
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function sendAction(action) {
  if (!state.sessionId) return;
  try {
    const res = await fetch('/api/hand/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: state.sessionId, action }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const data = await res.json();
    applyServerState(data);
  } catch (err) {
    alert(`Action failed: ${err.message}`);
  }
}

async function newHand() {
  if (!state.sessionId) return;
  if (state.chips <= 0) {
    openScoreModal();
    return;
  }
  try {
    const res = await fetch('/api/hand/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: state.sessionId }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const data = await res.json();
    state.pendingBet = 0;
    applyServerState(data);
  } catch (err) {
    alert(`Reset failed: ${err.message}`);
  }
}

// ── Cashout / score ───────────────────────────────────────────────────────────
function openScoreModal() {
  const net = state.chips - 1000;
  const sign = net > 0 ? '+' : '';
  elCashoutSummary.textContent =
    `You're cashing out with ${state.chips.toLocaleString()} chips (${sign}${net.toLocaleString()} from your starting 1,000).`;
  elPlayerName.value = localStorage.getItem('bj_playerName') || '';
  showModal(elModalScore);
  elPlayerName.focus();
}

async function submitScore(name) {
  try {
    const res = await fetch('/api/cashout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: state.sessionId, player_name: name }),
    });
    if (!res.ok) {
      const err = await res.json();
      console.warn('Score submission failed:', err.error);
    } else {
      localStorage.setItem('bj_playerName', name);
    }
  } catch (err) {
    console.warn('Score submission error:', err);
  }
  // Start fresh after cashout regardless
  clearSavedSession();
  state.sessionId = null;
  hideModal(elModalScore);
  await startNewSession(state.deckCount);
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
async function loadLeaderboard(deckCount) {
  elLBContent.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const res = await fetch(`/api/leaderboard?deck_count=${deckCount}`);
    if (!res.ok) throw new Error((await res.json()).error);
    const data = await res.json();
    renderLeaderboard(data.scores);
  } catch (err) {
    elLBContent.textContent = `Failed to load: ${err.message}`;
  }
}

function renderLeaderboard(scores) {
  if (!scores || scores.length === 0) {
    elLBContent.innerHTML = '<p class="empty-state">No scores yet — be the first!</p>';
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const table = document.createElement('table');
  table.className = 'leaderboard-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>#</th>
        <th>Player</th>
        <th>Chips</th>
        <th>Date</th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement('tbody');
  scores.forEach((s, i) => {
    const tr = document.createElement('tr');
    if (i < 3) tr.className = `rank-${i + 1}`;
    tr.innerHTML = `
      <td><span class="rank-medal">${medals[i] || (i + 1)}</span></td>
      <td>${escHtml(s.player_name)}</td>
      <td>${Number(s.chips).toLocaleString()}</td>
      <td>${fmtDate(s.created_at)}</td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  elLBContent.innerHTML = '';
  elLBContent.appendChild(table);
}

function openLeaderboardModal(deckCount) {
  // Activate correct tab
  elModalLB.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.deck) === deckCount);
  });
  showModal(elModalLB);
  loadLeaderboard(deckCount);
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function showModal(modal) {
  modal.classList.remove('hidden');
  elModalBackdrop.classList.remove('hidden');
}

function hideModal(modal) {
  modal.classList.add('hidden');
  // Only hide backdrop if no other modals are open
  const anyOpen = !elModalLB.classList.contains('hidden') || !elModalScore.classList.contains('hidden');
  if (!anyOpen) elModalBackdrop.classList.add('hidden');
}

// ── Deck selector sync ────────────────────────────────────────────────────────
function syncDeckButtons() {
  elDeckSelector.querySelectorAll('.deck-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.deck) === state.deckCount);
  });
}

// ── Event listeners ───────────────────────────────────────────────────────────
elBtnTheme.addEventListener('click', cycleTheme);

elBtnLeaderboard.addEventListener('click', () => openLeaderboardModal(state.deckCount));
elBtnCloseLB.addEventListener('click', () => hideModal(elModalLB));
elModalBackdrop.addEventListener('click', () => {
  hideModal(elModalLB);
  hideModal(elModalScore);
});

// Leaderboard tabs
elModalLB.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    elModalLB.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadLeaderboard(Number(btn.dataset.deck));
  });
});

// Deck selector
elDeckSelector.querySelectorAll('.deck-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const dc = Number(btn.dataset.deck);
    if (dc === state.deckCount && state.sessionId) return; // same deck, same session
    state.deckCount = dc;
    syncDeckButtons();
    if (state.sessionId) {
      clearSavedSession();
    }
    await startNewSession(dc);
  });
});

// Chip buttons
document.querySelectorAll('.chip-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const amount = parseInt(btn.dataset.amount, 10);
    if (state.pendingBet + amount > state.chips) return;
    state.pendingBet += amount;
    renderUI();
  });
});

elBtnClearBet.addEventListener('click', () => {
  state.pendingBet = 0;
  renderUI();
});

elBtnDeal.addEventListener('click', deal);

elBtnHit.addEventListener('click',    () => sendAction('hit'));
elBtnStand.addEventListener('click',  () => sendAction('stand'));
elBtnDouble.addEventListener('click', () => sendAction('double'));
elBtnSplit.addEventListener('click',  () => sendAction('split'));

elBtnOverlayNew.addEventListener('click', () => {
  if (state.chips <= 0) {
    elTableOverlay.classList.add('hidden');
    openScoreModal();
  } else {
    newHand();
  }
});

elBtnCashout.addEventListener('click', openScoreModal);

elScoreForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = elPlayerName.value.trim();
  if (!name) { elPlayerName.focus(); return; }
  await submitScore(name);
});

elBtnSkipScore.addEventListener('click', async () => {
  // Don't save score — just end session and start fresh
  if (state.sessionId) {
    // Fire-and-forget: best effort delete (no score saved)
    fetch('/api/cashout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: state.sessionId, player_name: '__skip__' }),
    }).catch(() => {});
  }
  clearSavedSession();
  state.sessionId = null;
  hideModal(elModalScore);
  await startNewSession(state.deckCount);
});

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  initTheme();
  syncDeckButtons();
  const resumed = await tryResumeSession();
  if (!resumed) {
    await startNewSession(state.deckCount);
  }
})();
