# Pulse

Pulse is a self-hosted, real-time polling proof of concept. Hosts create a question and share a short room code or invite link. Audience members vote without creating accounts; the host dashboard and audience results update live.

The frontend is plain HTML, CSS, and JavaScript, and the server uses Node.js built-ins—there are no runtime dependencies. The visual identity and layout live in `public/styles.css` and `public/index.html` so you can reshape them without adopting a UI framework.

## Features

- Create polls with a title, a question, and 2–8 answer options.
- Share an invite link or six-character room code.
- Watch live results update over Server-Sent Events.
- Close and reopen voting, or clear all votes and start a fresh round.
- Save poll data in a JSON file that survives restarts.
- Protect host controls with a configurable key.
- Run locally with Node.js or publish as a Docker container.

## Run locally

Requires Node.js 20 or later.

```sh
npm start
```

Open [http://localhost:3000](http://localhost:3000). The server prints a host key on startup; enter it from **Host settings** to create and manage polls. If you do not set `PULSE_ADMIN_KEY`, a new key is generated at each startup, so set one to keep the same key after restarts.

To set a persistent key and data location:

```sh
export PULSE_ADMIN_KEY="$(openssl rand -hex 24)"
printf 'Your host key: %s\n' "$PULSE_ADMIN_KEY"
DATA_DIR=./data npm start
```

## Deploy on Unraid with Docker Compose

1. Put this project on the Unraid server (for example, in `/mnt/user/appdata/pulse/app`) or clone its repository there.
2. In the project directory, create a `.env` file with a long, private key:

   ```sh
   printf 'PULSE_ADMIN_KEY=%s\n' "$(openssl rand -hex 24)" > .env
   ```

   Keep this file private and do not commit it.
3. Build and start Pulse:

   ```sh
   docker compose up -d --build
   ```

4. Open `http://<unraid-server-ip>:3000`. The named Docker volume `pulse-data` stores poll data across restarts and container rebuilds.
5. Choose **Host settings**, then enter the value of `PULSE_ADMIN_KEY` from `.env`.

You can also add this project as a Compose app in Unraid's Docker tooling. Keep the `pulse-data` named volume, publish container port `3000`, and set `PULSE_ADMIN_KEY` to your own random secret. To use an Unraid appdata host-path mapping instead, replace `pulse-data:/data` with `/mnt/user/appdata/pulse/data:/data` and make that directory writable by the container's `node` user (UID 1000).

### Publishing beyond your LAN

Put Pulse behind a reverse proxy that provides HTTPS (for example, your existing proxy manager). Keep the host key private, use a persistent data volume, and restrict access if your audience is not meant to be public. Do not expose an unencrypted HTTP port directly to the internet: the host key and audience traffic would not be protected in transit.

## Customize the look

- **Colors, typography, layout, and breakpoints:** `public/styles.css` (CSS custom properties are at the top).
- **Page structure and copy:** `public/index.html`.
- **Interaction and rendering:** `public/app.js`.
- **Server behavior and API:** `server.js`.

Static asset changes are served immediately; after server-side changes, restart the Node process or rebuild the container.

## API overview

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Container health check |
| `GET` | `/api/rooms` | Restore the latest room (host key required) |
| `POST` | `/api/rooms` | Create and open a poll (host key required) |
| `GET` | `/api/rooms/:code` | Read public poll details |
| `GET` | `/api/rooms/:code/events` | Subscribe to live poll updates |
| `POST` | `/api/rooms/:code/votes` | Cast one vote per browser per round |
| `PATCH` | `/api/rooms/:code/control` | Close, reopen, or reset voting (host key required) |

Host API calls use `Authorization: Bearer <PULSE_ADMIN_KEY>`. Polls are stored in `DATA_DIR/polls.json`. This is a single-process proof of concept; for a larger public audience, consider a database, stronger abuse controls, and a deployment design that supports multiple app instances.
