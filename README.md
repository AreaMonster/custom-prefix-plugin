# Custom LuckPerms Prefix Builder

Lets players design their own colored/gradient chat prefix on a simple
website and syncs it into LuckPerms in-game automatically — no manual
`/lp` commands. Supports two output formats: LuckPerms' native legacy hex

```
&8[&#FF99CC&lF&#F58FD6&lE&#EB85E0&lM&#E07AEB&lB&#D670F5&lO&#CC66FF&lY&8] &7» &#CC66FF
```

and, for shorter output on servers whose chat renders it, MiniMessage
gradients with any number of stops:

```
<gradient:#FFF700:#FF8000:#FF0000>ADVERTISER</gradient>
```

## How it works

1. A player runs `/prefix` (or `/prefix create`) on your Velocity proxy
   (permission-gated). `/prefix remove` clears their custom prefix
   instantly — that one's a direct LuckPerms call, no website involved.
   `/prefix admin` (separate permission) sends staff a short-lived,
   single-use link straight into the admin audit log, no password needed.
2. The plugin asks the website backend for a personal, temporary link and
   sends it to the player in chat.
3. The player opens the link, builds their prefix with a visual
   segment/gradient editor (multi-stop gradients, solid colors, bold/
   italic/underline/strikethrough/obfuscated), picks an output format, and
   saves.
4. The plugin (polling in the background) picks up the finished prefix and
   applies it via the real LuckPerms Java API.
5. The link expires ~20 minutes after creation, or immediately if the
   player closes the tab before saving.

Every save is checked against a word filter (blocks staff impersonation
by default, plus your own custom blocklist — staff can bypass it via a
permission node) before it's accepted, and recorded in a login-protected
admin audit log (`/admin.html`, its own username/password, colorized
previews instead of raw hex, searchable by player or prefix text) —
separate from the plugin's own credential, so admins never need it.
Players can also see their own last 5 saved prefixes on the build page
and click **Edit** to load one back into the builder — handy for reusing
a gradient with different text — never anyone else's.

## Repo layout

- [`website/`](website/) — self-hosted Node/Express backend + a
  dependency-free static frontend (no build step). Active links are
  memory-only by design (a restart just means running `/prefix` again),
  but player history and the audit log persist to `website/data/`. Fully
  self-contained for deployment: it has its own [`Dockerfile`](website/Dockerfile)
  and [`docker-compose.yml`](website/docker-compose.yml), so you can copy
  just this folder to a server and run `docker compose up -d --build`
  inside it — no need for the rest of the repo.
- [`plugin/`](plugin/) — the Velocity plugin (Java 17, Maven), registered
  as a proxy-level command so it works no matter which backend Paper
  server a player is on.
- [`docs/SETUP.md`](docs/SETUP.md) — full setup walkthrough: hosting the
  website behind your domain, building/installing the plugin, granting
  permissions, and end-to-end testing.

## Quick start

```bash
# 1. Website
cd website
cp .env.example .env   # fill in PUBLIC_BASE_URL and BACKEND_API_KEY
docker compose up -d --build    # or: npm install && npm start

# 2. Plugin
cd plugin
mvn package
# copy target/custom-prefix-plugin-1.0.0.jar into your Velocity plugins/ folder,
# then edit the generated plugins/custom-prefix-plugin/config.properties
# (backend.baseUrl + backend.apiKey must match the website's .env)
```

See [`docs/SETUP.md`](docs/SETUP.md) for the full walkthrough, including
putting the website behind your own domain with a reverse proxy, granting
the in-game permission, and a verification checklist.
