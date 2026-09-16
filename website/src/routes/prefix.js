'use strict';

const express = require('express');
const config = require('../config');
const store = require('../sessionStore');
const history = require('../historyStore');
const auditLog = require('../auditLog');
const moderation = require('../moderation');
const { extractVisibleText } = require('../textExtract');
const { validatePrefixString } = require('../validate/prefixString');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();
router.use(createRateLimiter({ windowMs: 60_000, max: 30 }));

// GET /api/prefix/:token -> { playerName, status, expiresAt, maxPrefixLength }
// The token itself is the credential here — no API key, this is the
// browser-facing side of a temporary personal link. maxPrefixLength is
// sent here rather than hardcoded client-side so the page always reflects
// whatever MAX_PREFIX_LENGTH is actually configured server-side.
router.get('/:token', (req, res) => {
  const session = store.getSession(req.params.token);
  if (!session) {
    return res.status(410).json({ error: 'This link has expired. Run /prefix again in-game.' });
  }
  res.json({
    playerName: session.playerName,
    status: session.status,
    expiresAt: session.expiresAt,
    maxPrefixLength: config.maxPrefixLength,
  });
});

// POST /api/prefix/:token  { prefixString, format } -> { ok: true }
// format is 'legacy' (default) or 'minimessage' — LuckPerms stores either
// as an opaque string, so this only affects which validator runs; the
// plugin doesn't need to know which one was used.
router.post('/:token', express.json({ limit: '4kb' }), (req, res) => {
  const session = store.getSession(req.params.token);
  if (!session) {
    return res.status(410).json({ error: 'This link has expired. Run /prefix again in-game.' });
  }
  if (session.status !== 'pending') {
    return res.status(409).json({ error: `session is already ${session.status}` });
  }

  const format = req.body && req.body.format === 'minimessage' ? 'minimessage' : 'legacy';
  const result = validatePrefixString(req.body && req.body.prefixString, format);
  if (!result.valid) {
    return res.status(400).json({ error: result.error });
  }

  const visibleText = extractVisibleText(result.value, format);
  const moderationResult = session.bypassFilter ? { blocked: false } : moderation.checkText(visibleText);
  if (moderationResult.blocked) {
    auditLog.record({
      playerUuid: session.playerUuid,
      playerName: session.playerName,
      format,
      prefixString: result.value,
      outcome: 'blocked',
      term: moderationResult.term,
    });
    // Deliberately generic — don't hand back which word tripped the
    // filter, or it becomes a roadmap for tweaking around it.
    return res.status(400).json({ error: 'That prefix contains a word that isn\'t allowed. Try something else.' });
  }

  store.markReady(session.token, result.value);
  history.record(session.playerUuid, { prefixString: result.value, format });
  auditLog.record({
    playerUuid: session.playerUuid,
    playerName: session.playerName,
    format,
    prefixString: result.value,
    outcome: 'saved',
    // Recorded for transparency, not enforcement — lets other admins see
    // in the log when the filter was skipped and for whom.
    filterBypassed: session.bypassFilter || undefined,
  });
  res.json({ ok: true });
});

// GET /api/prefix/:token/history -> { entries: [{ prefixString, format, savedAt }, ...] }
// Scoped to the token's own player — there's no way to ask for anyone
// else's history, since a token only ever maps to the one player it was
// issued to (same auth model as every other browser-facing route here).
router.get('/:token/history', (req, res) => {
  const session = store.getSession(req.params.token);
  if (!session) {
    return res.status(410).json({ error: 'This link has expired. Run /prefix again in-game.' });
  }
  res.json({ entries: history.getFor(session.playerUuid) });
});

// POST /api/prefix/:token/close
// Best-effort early expiry sent via navigator.sendBeacon when the tab is
// closed/hidden before saving. Not relied on as the sole expiry mechanism —
// the hard TTL in sessionStore is authoritative.
router.post('/:token/close', (req, res) => {
  store.expireIfPending(req.params.token);
  // sendBeacon doesn't care about the response body; keep it minimal.
  res.status(204).end();
});

module.exports = router;
