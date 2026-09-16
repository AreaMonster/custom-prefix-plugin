# Small, dependency-free Node backend + static frontend — no build step,
# so this is a single stage.
FROM node:20-alpine

WORKDIR /app

# Install deps first so this layer is cached unless package*.json changes.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public
# Wildcard so this doesn't fail the build if you haven't created your own
# moderation.words.txt yet (see moderation.words.example.txt) — only the
# example file gets copied in that case, which the app ignores. Rebuild
# (docker compose up -d --build) after editing your word list to pick it up.
COPY moderation.word*.txt ./

ENV PORT=8080
EXPOSE 8080

# busybox wget is present on alpine; avoids needing curl in the image.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1

# NOTE: deliberately NOT switching to the unprivileged 'node' user here.
# When ./data is bind-mounted from the host (see docker-compose.yml) and
# doesn't already exist there, Docker auto-creates it owned by root —
# which a non-root process inside the container then can't write to. That
# silently broke history/audit-log persistence (writes failed every time,
# so data only ever lived in memory and vanished on every restart) without
# ever surfacing an obvious error. Running as root inside the container
# avoids that whole class of host-UID-matching footgun; Docker's own
# container isolation is still the real security boundary here, which is
# unaffected by this.

CMD ["node", "src/server.js"]
