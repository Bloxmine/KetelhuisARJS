# KetelhuisARJS

Small local web project for valve synchronization and logging used with AR interactions.

## What it is
- Static client pages: `index.html`, `interaction.html`, `interacting.html`, `cabinet.html`, `story.html`, `log-monitor.html` and supporting assets in `images/`, `models/`, `sounds/`.
- `valve-sync-server.js`: an HTTPS Node.js server that serves the static files and provides a small API to manage valve states and record pressure/logging sessions to `logs/` as JSONL.

## Features
- Serve the app over HTTPS (self-hosted) and enable CORS
- API to get/set valve states (`/valve-state`)
- Logging session API to start, append samples, stop, and inspect live state (`/logging/*`)
- Writes session logs to `logs/` in JSONL format

## Quick start
Requirements: Node.js (v14+ recommended) and `openssl` (for generating self-signed certs if needed).

1. Open a terminal in the project root.

2. If you do not have TLS certs, create a self-signed cert (development only):

```bash
openssl req -x509 -newkey rsa:4096 -nodes -keyout server.key -out server.cert -days 365 -subj "/CN=localhost"
```

This will create `server.key` and `server.cert` used by `valve-sync-server.js`.

3. Run the server:

```bash
node valve-sync-server.js
```

By default the server listens on `https://localhost:3000` and serves the static files from the project root.

Open `https://localhost:3000` in your browser (you may need to accept the self-signed certificate for development).

## API
- `GET /valve-state` — returns current valve values (JSON: `{"valve1": 0, "valve2": 0}`)
- `POST /valve-state` — update valve values. Send JSON body with any of `valve1` and/or `valve2` (0–100). Returns `{ success: true, valveState }`.

- `POST /logging/start` — start a logging session. Optional body `{ "initialPressure": <number> }`. Returns `sessionId`, `fileName`, and `filePath`.
- `POST /logging/sample` — append a sample to an active session. Body must include `sessionId` and `pressure` (0–100).
- `POST /logging/stop` — stop a session. Body must include `sessionId`. Returns a `report` with summary and downsampled `graphSamples`.
- `GET /logging/live` — returns the active session state (if any) or the most recent completed report, or `{ state: 'idle' }`.

All API endpoints are served over HTTPS on the server port (default `3000`). The server sets permissive CORS headers for local development.

## Logs
- Log files are written to the `logs/` directory as JSON Lines (`.jsonl`). Each line is a JSON object with `type` like `session-start`, `sample`, or `session-stop`.
- `log-monitor.html` in the project can be used to inspect live and historic sessions in the browser.

## Configuration & notes
- TLS: `valve-sync-server.js` expects `server.key` and `server.cert` in the project root. For development, generate self-signed certs with `openssl` (example in Quick start).
- Port: the server listens on port `3000` by default. Change the `PORT` constant in `valve-sync-server.js` to use a different port.
- To run without TLS (development), you can modify `valve-sync-server.js` to use the `http` module and `http.createServer(...)` instead of `https` and omit the `options` object.

## Project structure (important files)
- `valve-sync-server.js` — HTTPS static server + API for valves and logging
- `index.html`, `interaction.html`, `interacting.html`, `cabinet.html`, `story.html`, `log-monitor.html` — client pages
- `patch_placement.js` — placement helpers used by the clients
- `logs/` — session JSONL logs
- `server.cert`, `server.key` — TLS cert and key (not committed in some setups)

## Troubleshooting
- If the server fails to start: ensure `server.key` and `server.cert` exist and are readable.
- Browser warnings about the cert? Accept the self-signed certificate for local testing or use a trusted cert.
- If CORS or mixed-content issues occur, ensure you load the app over `https://` and that API calls target the same scheme and host/port.

## Next steps
- If you want, I can add a `package.json` with `start`/`dev` scripts, or create a small HTTP-only fallback script for simpler development. Want me to add that?

---
Generated README for local development. Feel free to request edits or additions.