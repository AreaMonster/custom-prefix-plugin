'use strict';

const express = require('express');
const config = require('../config');
const auditLog = require('../auditLog');
const adminSessions = require('../adminSessions');
const adminMagicLinks = require('../adminMagicLinks');
const { requireAdminSession, requireApiKey, timingSafeStringEqual } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// POST /api/admin/login  { username, password } -> { token, expiresAt }
// Deliberately rate-limited (separate credential space from the plugin's
// API key, so this is the one endpoint actually exposed to a human typing
// a password rather than a system holding a long random secret).
router.post(
  '/login',
  express.json({ limit: '1kb' }),
  createRateLimiter({ windowMs: 5 * 60_000, max: 10 }),
  (req, res) => {
    if (!config.adminUsername || !config.adminPassword) {
      return res.status(503).json({
        error: 'Admin login is not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD in .env.',
      });
    }

    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const usernameOk = timingSafeStringEqual(username, config.adminUsername);
    const passwordOk = timingSafeStringEqual(password, config.adminPassword);
    if (!usernameOk || !passwordOk) {
      return res.status(401).json({ error: 'invalid username or password' });
    }

    const session = adminSessions.create();
    res.json(session);
  }
);

// POST /api/admin/logout — invalidates the current session token.
router.post('/logout', requireAdminSession, (req, res) => {
  adminSessions.destroy(req.get('X-Admin-Token'));
  res.json({ ok: true });
});

// POST /api/admin/magic-link  { playerUuid, playerName } -> { token, url, expiresAt }
// Called by the plugin when a permitted player runs '/prefix admin' — same
// auth model as session creation (the plugin's own API key), since this is
// a server-to-server call, not something a browser hits directly.
router.post('/magic-link', requireApiKey, express.json({ limit: '2kb' }), (req, res) => {
  const { playerUuid, playerName } = req.body || {};
  if (typeof playerUuid !== 'string' || typeof playerName !== 'string') {
    return res.status(400).json({ error: 'playerUuid and playerName are required' });
  }
  const link = adminMagicLinks.create(playerUuid, playerName);
  res.status(201).json({
    token: link.token,
    url: `${config.publicBaseUrl}/admin.html?token=${link.token}`,
    expiresAt: link.expiresAt,
  });
});

// POST /api/admin/redeem  { token } -> { token: <adminSessionToken>, expiresAt }
// Browser-facing: the magic link's token is itself the credential here
// (same pattern as the player-facing prefix routes) — exchanges a
// short-lived single-use link for a real 12h admin session, so the link
// itself stops working immediately after one use regardless of what
// happens to the resulting session token.
router.post(
  '/redeem',
  createRateLimiter({ windowMs: 60_000, max: 20 }),
  express.json({ limit: '1kb' }),
  (req, res) => {
    const { token } = req.body || {};
    if (typeof token !== 'string') {
      return res.status(400).json({ error: 'token is required' });
    }
    const link = adminMagicLinks.redeem(token);
    if (!link) {
      return res.status(410).json({ error: 'This admin link has expired or was already used.' });
    }
    const session = adminSessions.create();
    auditLog.record({
      playerUuid: link.playerUuid,
      playerName: link.playerName,
      format: '-',
      prefixString: '',
      outcome: 'admin_access',
    });
    res.json(session);
  }
);

// GET /api/admin/audit?limit=100 -> { entries: [...] }
router.get('/audit', requireAdminSession, (req, res) => {
  res.json({ entries: auditLog.list(req.query.limit) });
});

module.exports = router;
