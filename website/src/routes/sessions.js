'use strict';

const express = require('express');
const store = require('../sessionStore');
const config = require('../config');
const { requireApiKey } = require('../middleware/auth');

const router = express.Router();
router.use(requireApiKey);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Covers standard Java Edition names plus a bit of headroom for
// Bedrock/other display names (spaces, dots, hyphens) — mainly here to
// keep arbitrary HTML/script content out of a field that ends up
// rendered in the admin audit log page, not just cosmetic validation.
const PLAYER_NAME_RE = /^[A-Za-z0-9_ .-]{1,32}$/;

function sessionUrl(token) {
  return `${config.publicBaseUrl}/p/${token}`;
}

// POST /api/sessions  { playerUuid, playerName, bypassFilter } -> { token, url, expiresAt }
// Called by the plugin when a player runs /prefix. Invalidates any prior
// still-active session for that player. bypassFilter is the plugin's own
// LuckPerms permission check result for that player, at the moment they
// ran the command — the website has no way to check permissions itself,
// so it trusts whatever the plugin (already gated behind the shared API
// key) reports here.
router.post('/', express.json({ limit: '2kb' }), (req, res) => {
  const { playerUuid, playerName, bypassFilter } = req.body || {};

  if (typeof playerUuid !== 'string' || !UUID_RE.test(playerUuid)) {
    return res.status(400).json({ error: 'playerUuid must be a valid UUID' });
  }
  if (typeof playerName !== 'string' || !PLAYER_NAME_RE.test(playerName)) {
    return res.status(400).json({ error: 'playerName must be 1-32 chars: letters, numbers, underscore, space, dot, hyphen' });
  }

  const normalizedUuid = playerUuid.toLowerCase();
  const session = store.createSession(normalizedUuid, playerName, bypassFilter === true);

  res.status(201).json({
    token: session.token,
    url: sessionUrl(session.token),
    expiresAt: session.expiresAt,
  });
});

// GET /api/sessions/:token/status -> { status, prefixString, expiresAt }
// Polled by the plugin every few seconds.
router.get('/:token/status', (req, res) => {
  const session = store.getSession(req.params.token);
  if (!session) {
    return res.status(410).json({ error: 'session not found or expired' });
  }
  res.json({
    status: session.status,
    prefixString: session.prefixString,
    expiresAt: session.expiresAt,
  });
});

// POST /api/sessions/:token/ack
// Called by the plugin once it has successfully applied the prefix in
// LuckPerms. Frees the session immediately.
router.post('/:token/ack', (req, res) => {
  const session = store.markApplied(req.params.token);
  if (!session) {
    return res.status(410).json({ error: 'session not found or expired' });
  }
  res.json({ ok: true });
});

module.exports = router;
