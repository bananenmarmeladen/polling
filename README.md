# Cantus Domus live project ideas

A self-hosted, live vote for concert-project ideas. Participants can enter any text, see previously submitted ideas as autocomplete suggestions, and submit their own. All submitted names are normalized to uppercase and immediately shared with every connected participant. The `/results` screen is a white full-screen word cloud that updates live; more popular ideas appear larger.

The participant page uses the supplied Cantus Domus logo and font. No fixed project catalog or sample ballots are loaded: a new data directory starts with an empty idea list and an empty word cloud.

## Run locally

Requires Node.js 20 or later.

```sh
npm ci
ALLOW_REPEAT_VOTES=true PORT=3001 DATA_DIR=./data-free-test npm start
```

Open:

- `http://localhost:3001/` to submit ideas.
- `http://localhost:3001/results` to show the live word cloud.

Repeat-vote test mode is active by default. Each submitted ballot is counted, including multiple ballots from the same browser, so you can freely test different ideas. Test data is kept in `data-free-test/`, which is ignored by Git. To test one-vote-per-browser behavior, run with `ALLOW_REPEAT_VOTES=false`.

## Deploy with Docker Compose

Build and start the app:

```sh
docker compose up -d --build
```

Compose enables repeat-vote mode by default for testing. Set `ALLOW_REPEAT_VOTES=false` in `.env` before running a real vote. The default Docker volume `pulse-data` stores votes in `word-votes.json`; remove the volume only when you intend to clear all votes. Use HTTPS through a reverse proxy before exposing the service outside your LAN.

## How it works

- User input is trimmed, whitespace-normalized, limited to 48 characters, and converted to uppercase by both browser and server.
- Each distinct submitted name becomes a suggestion for all participants. Connected browsers receive new suggestions over Socket.IO without refreshing.
- Votes and their submitted names are saved in `DATA_DIR/word-votes.json`.
- The results page uses the MIT-licensed WordCloud2.js plugin, bundled from the local npm dependency (no CDN). It lays out submitted ideas across the full viewport, with text size reflecting vote count and a high-contrast color palette.
- Test mode allows repeat submissions. With `ALLOW_REPEAT_VOTES=false`, one stable voter ID per browser is accepted.

## Customization

- Colors and participant layout: `public/styles.css`.
- Free-text ballot and autocomplete: `public/index.html` and `public/app.js`.
- Full-screen word-cloud layout: `public/results.html` and `public/results.js`.
- Vote persistence and API: `server.js`.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/projects` | Get submitted ideas for autocomplete |
| `GET` | `/api/config` | Read whether repeat-vote test mode is enabled |
| `GET` | `/api/results` | Get each idea and its vote count |
| `POST` | `/api/votes` | Submit `{ "name": "CONCERT IDEA", "voterId": "..." }` |
| Socket.IO | default namespace | Receive live `results` and `suggestions` events |
