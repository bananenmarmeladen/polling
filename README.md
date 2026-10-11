# Cantus Domus project voting

A self-hosted project vote with a mobile-friendly participant page and a live presentation screen. Participants search a list of projects and cast one vote per browser. The `/results` screen displays the 20 highest-ranked projects as a Chart.js column chart and updates in real time over Socket.IO.

The participant page uses the supplied Cantus Domus logo and AlphaBetaDomus font. Its styling is in `public/styles.css` and the logo/font assets are served locally. The presentation chart libraries are installed with npm and also served locally; the app does not rely on third-party CDNs.

## Start locally

Requires Node.js 20 or later.

```sh
npm ci
npm start
```

Open:

- `http://localhost:3000/` to vote.
- `http://localhost:3000/results` to show the live top-20 presentation chart.

The default catalog is `projects.json`, containing 200 fictional German classical choir concert projects dated from 1996 through 2026 (at least six per year). Each project has a stable ID. Edit the names in that file to suit your event; keep the IDs unchanged so existing votes remain attached. It can be a JSON array of strings or an array of objects such as:

```json
[
  { "id": "music-room", "name": "Neuer Probenraum" },
  { "id": "youth-choir", "name": "Jugendchor-Fahrt" }
]
```

Project IDs must be unique. Do not remove or rename IDs with saved votes unless you have first backed up and cleared the vote data. To load another catalog file, set `PROJECTS_FILE=/path/to/projects.json`.

On a fresh data directory, the app starts with exactly 153 committed proof-of-concept votes from `sample-votes.json`, spread across the first 20 projects. It copies these into `DATA_DIR/project-votes.json` on initial startup, and later votes persist there. Existing vote files are preserved and are never overwritten with the demo seed.

## Deploy on Unraid

1. Copy or clone the project to a persistent Unraid directory.
2. Create a private `.env` file in the project folder:

   ```sh
   printf 'PULSE_ADMIN_KEY=%s\n' "$(openssl rand -hex 24)" > .env
   ```

   This key is retained for the legacy poll-management API; participant voting does not require a key. Keep `.env` private and do not commit it.
3. Build and start the Compose app:

   ```sh
   docker compose up -d --build
   ```

4. Open `http://<unraid-server-ip>:3000/` for voting and `http://<unraid-server-ip>:3000/results` on the presentation display.
5. Project names are mounted from `projects.json`, so you can edit the file on Unraid and restart the container to load changes. On a new `pulse-data` volume, 153 sample votes are loaded automatically; votes then persist in that volume.

Put the app behind an HTTPS reverse proxy before exposing it to the internet. For a public vote, note that browser local storage and an anonymous voter ID prevent accidental repeat voting, but are not identity verification and can be cleared or spoofed. Add authentication or stronger abuse controls if the vote needs to be binding.

## Customization

- Colors, spacing, typography, and responsive layouts: `public/styles.css`.
- Participant markup and autocomplete: `public/index.html` and `public/app.js`.
- Presentation chart: `public/results.html` and `public/results.js`.
- Editable project names: `projects.json`.
- API and persistence: `server.js`.
- Supplied logo and font: `public/cantus-domus-logo.svg` and `public/fonts/AlphaBetaDomus-Three.otf`.

Votes are stored in `DATA_DIR/project-votes.json` (default: `./data/project-votes.json`). Server-Sent Events remain available for the original poll-room API; project-ranking updates use Socket.IO.

## Project voting API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/projects` | Get the available projects |
| `GET` | `/api/results` | Get the current top 20 and total vote count |
| `POST` | `/api/votes` | Submit `{ "projectId": "...", "voterId": "..." }` |
| Socket.IO | default namespace | Receive `results` events after each vote and on connect |
