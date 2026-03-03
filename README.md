# Blackjack

A web-based Blackjack game with betting, splits, and a persistent leaderboard, served from a containerised Node.js backend.

## Features

- Start with 1 000 chips; configurable shoe — 1, 2, or 6 decks
- Full action set — Hit, Stand, Double Down, Split
- Dealer hits on soft 17
- Cashout at any time to submit your chip total to the leaderboard
- Dark mode — follows system preference, with a manual toggle

## Running locally

### With Docker Compose (recommended)

```bash
docker compose up --build
```

Then open <http://localhost:3001>.

The SQLite database is stored in the `blackjack-data` named volume and survives container restarts.

## Container image

The image is published to the GitHub Container Registry on every push to `main`:

```bash
docker pull ghcr.io/JakePeralta7/blackjack:latest
docker run -p 3001:3000 -v blackjack-data:/data ghcr.io/JakePeralta7/blackjack:latest
```

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/session` | Start a new session. Body: `{ deck_count: 1 \| 2 \| 6 }` |
| `GET` | `/api/session/:id` | Get current game state. |
| `POST` | `/api/hand/deal` | Place a bet and deal. Body: `{ session_id, bet }` |
| `POST` | `/api/hand/hit` | Draw a card. Body: `{ session_id }` |
| `POST` | `/api/hand/stand` | Stand on the current hand. Body: `{ session_id }` |
| `POST` | `/api/hand/double` | Double down. Body: `{ session_id }` |
| `POST` | `/api/hand/split` | Split a pair. Body: `{ session_id }` |
| `POST` | `/api/cashout` | Cash out and record score. Body: `{ session_id, player_name }` |
| `GET` | `/api/leaderboard?deck_count=` | Top scores for a deck count. |

## Project structure

```
.
├── backend/
│   ├── db.js          # SQLite schema, sessions & scores
│   ├── game.js        # Deck, hand value, and outcome logic
│   ├── server.js      # Express app & API routes
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── style.css      # CSS custom properties + dark mode
│   └── game.js        # Betting UI, card rendering, leaderboard
├── docker-compose.yml
└── Dockerfile
```
