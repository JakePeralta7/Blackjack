'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'blackjack.db');

const db = new Database(DB_PATH);

// Performance & integrity pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    session_id  TEXT    PRIMARY KEY,
    deck_count  INTEGER NOT NULL,
    chips       INTEGER NOT NULL,
    state       TEXT    NOT NULL,
    started_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scores (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT    NOT NULL,
    chips       INTEGER NOT NULL,
    deck_count  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_scores_deck_chips
    ON scores (deck_count, chips DESC);
`);

// ─── Session helpers ──────────────────────────────────────────────────────────

const stmtCreateSession = db.prepare(`
  INSERT INTO sessions (session_id, deck_count, chips, state, started_at)
  VALUES (@session_id, @deck_count, @chips, @state, @started_at)
`);

const stmtGetSession = db.prepare(`
  SELECT * FROM sessions WHERE session_id = ?
`);

const stmtUpdateSession = db.prepare(`
  UPDATE sessions SET chips = @chips, state = @state WHERE session_id = @session_id
`);

const stmtDeleteSession = db.prepare(`
  DELETE FROM sessions WHERE session_id = ?
`);

function createSession(session_id, deck_count, chips, state) {
  stmtCreateSession.run({
    session_id,
    deck_count,
    chips,
    state: JSON.stringify(state),
    started_at: Date.now(),
  });
}

function getSession(session_id) {
  const row = stmtGetSession.get(session_id);
  if (!row) return null;
  return { ...row, state: JSON.parse(row.state) };
}

function updateSession(session_id, chips, state) {
  stmtUpdateSession.run({ session_id, chips, state: JSON.stringify(state) });
}

function deleteSession(session_id) {
  stmtDeleteSession.run(session_id);
}

// ─── Score helpers ────────────────────────────────────────────────────────────

const stmtSaveScore = db.prepare(`
  INSERT INTO scores (player_name, chips, deck_count, created_at)
  VALUES (@player_name, @chips, @deck_count, @created_at)
`);

const stmtGetLeaderboard = db.prepare(`
  SELECT player_name, chips, created_at
  FROM scores
  WHERE deck_count = ?
  ORDER BY chips DESC
  LIMIT 10
`);

function saveScore(player_name, chips, deck_count) {
  stmtSaveScore.run({ player_name, chips, deck_count, created_at: Date.now() });
}

function getLeaderboard(deck_count) {
  return stmtGetLeaderboard.all(deck_count);
}

// ─── Session expiry (24 h) ────────────────────────────────────────────────────

const stmtPurge = db.prepare(`
  DELETE FROM sessions WHERE started_at < ?
`);

function purgeExpiredSessions() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  stmtPurge.run(cutoff);
}

purgeExpiredSessions();
setInterval(purgeExpiredSessions, 60 * 60 * 1000);

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  createSession,
  getSession,
  updateSession,
  deleteSession,
  saveScore,
  getLeaderboard,
};
