# MeowMeow Imposter — realtime server

Standalone, server-authoritative multiplayer backend. No database, no auth, no
admin panel. Every room lives in RAM and is destroyed automatically when it
empties.

## Run locally

```bash
cd server
npm install
npm start          # ws://localhost:8787/ws
```

Point the web app at it with `VITE_WS_URL=ws://localhost:8787/ws`.

## Deploy (Render / Fly / Railway / any VPS)

- Runtime: Node 20+
- Start command: `node src/index.js`
- Health check: `GET /health`
- Expose HTTPS so the browser can use `wss://your-host/ws`

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | listen port |
| `ALLOWED_ORIGINS` | `*` | comma separated origins allowed to connect |
| `MIN_PLAYERS` / `MAX_PLAYERS` | `3` / `30` | room capacity |
| `WRITER_SECONDS` | `90` | secret-word timeout |
| `VOTING_SECONDS` | `45` | voting timeout |
| `RECONNECT_GRACE_MS` | `45000` | how long a seat is reserved |
| `ROOM_MAX_LIFETIME_MS` | `21600000` | hard room expiry |
| `NODE_ENV` | `development` | `production` silences debug logs |

## Modules

`index.js` gateway · `dispatcher.js` event dispatcher · `roomManager.js` ·
`playerManager.js` · `gameManager.js` phase machine · `roleManager.js` ·
`voteManager.js` · `timerManager.js` · `voiceManager.js` WebRTC signalling ·
`serialize.js` sanitised state · `settings.js` validation · `logger.js`.