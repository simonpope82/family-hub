# Family Hub

Zero-build family calendar / kitchen-screen hub: plain Node `http` server, static files, JSON file storage.
One family password protects everything (pages and `/api/`).

## Run locally

    npm ci
    npm start            # http://localhost:3000  (PORT env to change)

Local private files (all gitignored): `config/auth.json` (password hash), `data/data.json` (family data),
`data/school-import/*.json`, `private/trip.html`.
Set or change the password with `node scripts/set-password.js "new-password"`.

## Private configuration (never committed)

Each item is read from the first source that exists: **env var → Render Secret File (`/etc/secrets/<name>`) → local file**.
Env values may be raw JSON/HTML or base64 of it.

| What | Env var | Secret File | Local file |
|---|---|---|---|
| Password | `AUTH_SALT` + `AUTH_HASH` + `SESSION_SECRET` (+ `SESSION_DAYS`), or `AUTH_JSON` | `auth.json` | `config/auth.json` |
| Family data (seed) | `FAMILY_DATA_JSON` | `family-data.json` | `data/data.json` |
| School-plan imports | `SCHOOL_IMPORTS_JSON` (`{"file.json": {...}}`) | `school-imports.json` | `data/school-import/*.json` |
| Trip page `/trip` | `TRIP_HTML` or `TRIP_FILE` (path) | `trip.html` | `private/trip.html` |

Other env: `PORT` (set by host), `DATA_DIR` (default `./data`), `SECRETS_DIR` (default `/etc/secrets`),
`REQUIRE_AUTH=1` (refuse to start without a password; automatic on Render).

## Deploy on Render (free Web Service)

Build `npm ci`, start `npm start`, health check `/healthz`. Add the env vars / secret files above.

**Storage caveat:** the free plan has no persistent disk. `data/data.json` is re-seeded from
`FAMILY_DATA_JSON` / `family-data.json` on every restart, redeploy and wake-up after idling, so edits made in
the app are lost then. Download a backup at `/api/export` (while signed in) and paste it into the secret to keep them.
