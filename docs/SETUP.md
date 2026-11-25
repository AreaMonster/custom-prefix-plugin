# Setup Guide

## 1. Prerequisites

- A Velocity proxy in front of your Paper backend servers, all sharing one
  LuckPerms installation (LuckPerms-Velocity installed on the proxy, and
  LuckPerms on each backend server as normal).
- Node.js 18+ on the machine that will host the website (can be the same
  machine as your proxy, or any machine reachable at a domain you control).
- Java 17+ and Maven to build the plugin.
- A domain you control, pointed at the machine hosting the website, with a
  reverse proxy (nginx or Caddy) terminating TLS. This project does not
  configure DNS or the reverse proxy for you — set that up first however
  you normally do.

**Before you build**, open [`plugin/pom.xml`](../plugin/pom.xml) and check
`velocity.api.version` / `luckperms.api.version` against what your proxy
actually runs — these were pinned against a recent Velocity/LuckPerms
build during development (verified to compile: Velocity API
`3.4.0-SNAPSHOT`, LuckPerms API `5.4`), but Velocity's API artifact in
particular is commonly only published as a `-SNAPSHOT` version even for
stable proxy releases — that's expected, not a mistake.

## 2. Website

```bash
cd website
cp .env.example .env
```

Edit `.env`:
- `PUBLIC_BASE_URL` — the real `https://` URL players will open (must match
  your domain + reverse proxy), no trailing slash.
- `BACKEND_API_KEY` — a long random secret. Generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
  ```
  This must match `backend.apiKey` in the plugin's config (step 3).
- `SESSION_TTL_MINUTES` — defaults to 20.

Install and run — pick one:

**Option A: Docker (recommended)**
```bash
# still inside website/, next to docker-compose.yml and .env
docker compose up -d --build
docker compose logs -f    # confirm "listening on port 8080"
```
This builds the image from [`website/Dockerfile`](../website/Dockerfile),
reads the `.env` file in the same folder for config, and restarts
automatically on reboot (`restart: unless-stopped`). `website/` is fully
self-contained for this — you can copy just that folder to your server,
you don't need the rest of the repo. To update after pulling code changes:
```bash
docker compose up -d --build
```
To stop it: `docker compose down`.

> **Port already in use?** If `docker compose up` fails to bind, or a
> *different* container/service crash-loops with something like
> `Bind for 0.0.0.0:8080 failed: port is already allocated`, something
> else on the host already owns port 8080 — common on shared hosts like
> Pterodactyl, where a game server's own port allocation can collide with
> it. Set `HOST_PORT` to something free in `.env` (e.g. `HOST_PORT=8090`),
> then `docker compose up -d --build` again. The container still listens
> on 8080 *internally* — only the host-side port changes — so just point
> your reverse proxy at the new `HOST_PORT` instead of 8080. To see what's
> already bound to a port: `sudo ss -tlnp | grep 8080`.

**Option B: plain Node.js**
```bash
npm install
npm start
```
Run it under `pm2`, a `systemd` service, or similar so it survives a
reboot/crash — with this option nothing restarts it for you.

Either way it listens on `PORT` (default 8080) over plain HTTP — put your
reverse proxy in front of it for TLS/your domain. Minimal nginx example:

```nginx
server {
    listen 443 ssl;
    server_name prefix.yourdomain.com;
    # ... your TLS cert config ...

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
(The app calls `app.set('trust proxy', 1)`, so `X-Forwarded-For` is
respected for rate limiting once it's behind a proxy like this.)

Either way, the process holds all session state in memory, so restarting
it invalidates any links that are currently open (acceptable/expected;
players just run `/prefix` again).

**Verify it's up:** `curl https://prefix.yourdomain.com/healthz` → `ok`.

## 3. Plugin

```bash
cd plugin
mvn package
```
Produces `target/custom-prefix-plugin-1.0.0.jar`. Copy it into your
Velocity proxy's `plugins/` folder and (re)start the proxy once so it
generates its config folder.

Edit `plugins/custom-prefix-plugin/config.properties`:
- `backend.baseUrl` — the website's URL, e.g. `https://prefix.yourdomain.com`
  (this is what the *plugin* calls server-to-server; it can point at
  `http://127.0.0.1:8080` directly if the website runs on the same
  machine, skipping the reverse proxy for this internal call — either
  works, just be consistent).
- `backend.apiKey` — must exactly match `BACKEND_API_KEY` from the
  website's `.env`.
- `permission.node` — defaults to `customprefix.use`.
- `permission.bypassFilter` — defaults to `customprefix.bypassfilter`. A
  player with this permission skips the moderation word filter entirely
  (both the built-in staff-impersonation words and your
  `moderation.words.txt` list) — for staff who legitimately want an
  "Owner"/"Admin"-flavored prefix. Nobody has it by default; grant it
  deliberately, e.g. `/lp group admin permission set customprefix.bypassfilter true`.
  Bypassed saves are still fully recorded in the audit log/`/admin.html`
  (tagged "filter bypassed") for accountability — the bypass isn't secret,
  just unblocked.
- `permission.adminAccess` — defaults to `customprefix.admin`. A player
  with this permission can run `/prefix admin` to get a link straight into
  the admin audit log page — no `ADMIN_USERNAME`/`ADMIN_PASSWORD` needed.
  See the "Commands" list below for how the link itself works. Nobody has
  it by default; grant it deliberately, e.g.
  `/lp group admin permission set customprefix.admin true`.
- `prefix.priority` — the LuckPerms weight this plugin owns. Pick a value
  that doesn't collide with your rank ladder's prefix priorities (e.g. if
  ranks use 1–50, use 100 for this).
- `poll.intervalSeconds` — how often the plugin checks whether you've
  saved yet. Defaults to 1s (fast). Lower = quicker "applied" message,
  at the cost of a few more requests/sec to your own backend — fine for
  any normal server.

Restart the proxy again to pick up the edited config.

**Updating an existing install:** the plugin automatically adds any new
config/message keys introduced by a newer jar to your existing
`config.properties` on next startup (appended under a `# --- new keys
added automatically after a plugin update ---` comment) — it never
overwrites anything you've already customized. It does *not* change
values that already exist, though: if your file predates this update and
still has `poll.intervalSeconds=3`, bump it to `1` yourself to get the
faster default.

**Commands:**
- `/prefix` or `/prefix create` — generate a personal link to design a new prefix.
- `/prefix remove` (aliases: `delete`, `clear`) — clears the custom prefix
  immediately. This one never touches the website — it's a direct
  LuckPerms call, so it works even if the website is down.
- `/prefix admin` — sends a link that logs straight into `/admin.html`,
  no username/password needed. The link itself is short-lived (10 min)
  and single-use — it's exchanged for a real 12h admin session the moment
  it's opened, then immediately stops working even if reused. Every use
  is recorded in the audit log itself (tagged "admin access") so there's
  a record of who checked it and when. Gated by its own
  `permission.adminAccess`, independent of the other two commands — the
  username/password login (`ADMIN_USERNAME`/`ADMIN_PASSWORD`) still works
  exactly as before and isn't going anywhere; this is just a faster path
  for whoever holds the permission.

`create`/`remove` are gated by `permission.node`; `admin` by its own
separate `permission.adminAccess` (see above) — a player can have either
without the other.

Grant the permission via LuckPerms (proxy-side or network-wide storage,
as usual for your setup), e.g.:
```
/lp group default permission set customprefix.use true
```
or gate it to a specific rank/donor group instead of `default`.

## 4. Moderation, player history, and the admin log

These are all part of the website — no plugin config needed.

**Word filter.** Every save is checked against a blocked-term list before
it's accepted. A built-in list of staff-role words (owner, admin,
moderator, staff, founder, etc.) is always active, so players can't fake
being staff via their prefix. To also block profanity/slurs (left to you,
not shipped with a list — see [`website/moderation.words.example.txt`](../website/moderation.words.example.txt)):
```bash
cd website
cp moderation.words.example.txt moderation.words.txt
# edit moderation.words.txt with your own list, one term per line
docker compose up -d --build   # rebuild to pick up the new file
```
Matching normalizes spacing/punctuation and common leetspeak
(`0`→o, `1`→i, `3`→e, `4`→a, `5`→s, `7`→t, `@`→a, `$`→s), so `"O w n e r"`
and `"0wner"` are both caught. A blocked save shows the player a generic
"that word isn't allowed" message — the specific term it matched is never
revealed to them, only recorded for you (see the audit log below).

**Player history.** Each player's build page shows their own last 5 saved
prefixes (never anyone else's — scoped the same way every other page is,
via their one-time link), with an **Edit** button that loads one back
into the segment builder — same as clicking "Load example," just from a
real past save instead of the sample. Nothing is reapplied until they hit
Save again, so they can freely tweak the text/colors first (e.g. keep a
gradient but change the word it's applied to) or just resave it as-is.
Solid colors and 2-stop gradients reconstruct exactly; a 3+-stop gradient
over a very short run of characters can come back as individual solid
letters instead of one gradient control (still visually identical, just
less convenient to tweak further). Persisted to `website/data/history.json`
(survives restarts; the Docker volume for `data/` is already set up).

**Starting from the player's rank prefix.** When a player runs `/prefix`,
the plugin reads their current rank prefix from LuckPerms (the
highest-priority prefix that isn't the custom one this plugin manages, so
players who already have a custom prefix still get their *rank*, not their
own previous design) and passes it along with the link. The builder's
example button then reads **"Start from my rank prefix"** and loads it as
editable segments — plain `&c`-style codes, `&#RRGGBB`, and `&x&r&r&g&g&b&b`
are all understood. If LuckPerms has no usable rank prefix for the player,
the button is a plain **"Load example"** with a generic sample instead.

**Admin audit log.** Every save attempt — accepted or blocked — is
recorded with the player, prefix (rendered with its actual in-game colors,
not raw hex codes), and (if blocked) which term matched. View it
at `https://prefix.yourdomain.com/admin.html` and log in with
`ADMIN_USERNAME`/`ADMIN_PASSWORD` from `.env` — a **separate credential
from `BACKEND_API_KEY`**, so admins never need to know/paste the plugin's
shared secret. Logging in issues a 12-hour session token (kept in that
browser tab's session storage; "Log out" invalidates it server-side too).
There's a search box to filter by player name or the prefix's visible
text (also hex-free). This page isn't linked from anywhere public, but
it's also not IP-restricted, and the login endpoint is rate-limited (10
attempts/5 min per IP) against password guessing — still worth picking a
real generated password, not something guessable.

It also mirrors every entry to the server's own stdout/stderr
(`docker compose logs -f`) and to `website/data/audit.log` (JSON-lines,
one entry per line, raw/uncolored) if you'd rather tail/grep it directly:
```bash
tail -f website/data/audit.log
```

## 5. Verification checklist

**Backend only (no Minecraft needed):**
```bash
KEY=your-backend-api-key
curl -s -X POST https://prefix.yourdomain.com/api/sessions \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"playerUuid":"11111111-1111-1111-1111-111111111111","playerName":"Steve"}'
# -> { token, url, expiresAt }
```
Open the returned `url` in a browser, click **Load example**, confirm the
live preview shows the bracket/gradient/separator prefix, click **Save**,
then confirm the plugin-facing status flips to `ready`:
```bash
curl -s https://prefix.yourdomain.com/api/sessions/<token>/status -H "X-API-Key: $KEY"
```
Reopen a fresh link for the same `playerUuid` and confirm the save you
just made shows up under "Your recent prefixes". Click **Edit** on it and
confirm it loads back into the segment builder (not instantly applied) —
change the text of the gradient segment and confirm the preview updates
while keeping the same gradient colors. Try saving `OWNER` and
confirm it's rejected — then log in at `https://prefix.yourdomain.com/admin.html`
with your `ADMIN_USERNAME`/`ADMIN_PASSWORD` and confirm it shows up
`blocked`, rendered in color rather than raw hex. Try the search box with
the player's name and with a word from the prefix's visible text. Repeat
the `OWNER` save with `"bypassFilter":true` in the `/api/sessions` call
and confirm it succeeds, showing up in the audit log tagged "filter
bypassed".

**In-game:**
1. Run `/prefix` as a permitted player — you should get a clickable link
   in chat within about a second.
2. Run it from more than one backend server if you can — it should work
   identically since the command is registered on the proxy.
3. Build and save a prefix; within one poll interval (`poll.intervalSeconds`,
   default 1s) you should get an "applied" chat message.
4. Check `/lp user <name> permission info` — you should see exactly one
   prefix node at your configured `prefix.priority`, not stacked.
5. Run `/prefix` twice without finishing the first — confirm the old link
   stops working (opens to "This link has expired").
6. Stop the website process and run `/prefix` — confirm you get the
   configured "couldn't reach the prefix server" message instead of an
   error/stack trace in chat.
7. Open a link, close the tab without saving — about a minute later
   (not instantly), re-check its status via curl and confirm it now reads
   as expired. Also confirm that reloading the page, or switching to
   another window and back, does **not** expire it.
8. Run `/prefix remove` — confirm the prefix node is gone from
   `/lp user <name> permission info` immediately, with no website
   round-trip needed (works even with the website stopped).
9. Without `customprefix.bypassfilter`, try saving a prefix containing
   "Owner" — confirm it's rejected. Grant yourself the permission
   (`/lp user <name> permission set customprefix.bypassfilter true`), run
   `/prefix` again, and confirm the same save now succeeds.
10. Without `customprefix.admin`, run `/prefix admin` — confirm you get
    the no-permission message. Grant yourself the permission, run it
    again, and confirm the link logs you straight into `/admin.html` with
    no login form shown. Click the same link a second time (or reuse the
    URL) and confirm it now fails — it's single-use. Confirm the
    username/password login still works separately, and that the access
    itself shows up in the audit log tagged "admin access".

## Notes / things you may want to adjust

- **Output format:** prefixes are always saved as LuckPerms legacy hex
  (`&#RRGGBB` repeated per character), which every chat plugin that
  displays LuckPerms prefixes understands. (An earlier version also
  offered MiniMessage; it was removed because plugins like LPC don't
  render MiniMessage tags inside `{prefix}`, so those prefixes showed up as
  literal `<gradient:...>` text. Old MiniMessage entries in your history
  are hidden from players and shown as plain text in the audit log.)
- **Prefix length cap (160 chars, configurable):** LuckPerms stores
  prefixes wrapped as `prefix.<priority>.<value>` in a single database
  column that defaults to `VARCHAR(200)` on MySQL/MariaDB. `MAX_PREFIX_LENGTH`
  in `.env` (default 160) keeps nothing a player builds able to exceed
  what a default, untouched LuckPerms install can actually store — you do
  **not** need to modify your database for this tool to work. Each colored
  letter costs ~9+ characters of this budget (a full `&#RRGGBB` code per
  letter), so a long gradient word uses it up quickly. Want more room?
  Raise `MAX_PREFIX_LENGTH` directly. Safe up to ~185 or so against an
  unmodified default schema; past that you're gambling unless you've
  actually widened the `permission` column yourself (`ALTER TABLE
  luckperms_user_permissions MODIFY permission VARCHAR(500) NOT NULL;`,
  adjusting for your `table-prefix`) — in which case raise it as far as
  you like. The frontend reads this value from the server on page load, so
  you only ever need to change it in one place (`.env`).
- **Links that can't be clicked:** the link is sent as clickable text plus
  the plain URL on a second line. Players with "Web Links" turned off in
  their Minecraft chat settings, and Bedrock players joining through
  Geyser, can't click chat links at all — they'll need to copy the URL
  text (or enable web links) instead.
- **What's persistent vs. ephemeral:** active links/sessions
  (`sessionStore.js`) are still deliberately in-memory-only and reset on
  restart — a stale link just means "run `/prefix` again," no real cost.
  Player history and the audit log (`historyStore.js`/`auditLog.js`) are
  different: those are meant to accumulate over time, so they're written
  to `website/data/` on disk (mounted as a volume in `docker-compose.yml`)
  and survive restarts/rebuilds. Delete that folder any time to wipe both.
  The server checks at startup that this folder is actually writable and
  logs a loud, impossible-to-miss error if it isn't (Docker will
  auto-create a bind-mounted host folder that doesn't exist yet owned by
  `root`, which a non-root container process then can't write to — a
  real bug this project hit, fixed by having the container run as root,
  since Docker's own isolation is the actual security boundary here, not
  the in-container user). If you deployed before this fix and history/the
  audit log weren't surviving restarts, a plain rebuild resolves it:
  ```bash
  cd website
  docker compose up -d --build
  ```
  Check `docker compose logs -f` after starting — you should see
  `data directory is writable` near the top, not the loud error block.
