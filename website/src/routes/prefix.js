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

// GET /api/prefix/:token -> { playerName, status, expiresAt, serverNow, maxPrefixLength, rankPrefix }
// The token itself is the credential here — no API key, this is the
// browser-facing side of a temporary personal link. maxPrefixLength is
// sent here rather than hardcoded client-side so the page always reflects
// whatever MAX_PREFIX_LENGTH is actually configured server-side.
// serverNow lets the page count down against the server's clock instead of
// the player's own (which can be minutes or hours off and would otherwise
// make a fresh link look expired on arrival).
router.get('/:token', (req, res) => {
  const session = store.getSession(req.params.token);
  if (!session) {
    return res.status(410).json({ error: 'This link has expired. Run /prefix again in-game.' });
  }
  // The page is (re)loading, so a pending "tab was closed" countdown from
  // a previous reload/close no longer applies.
  store.cancelClose(session.token);
  res.json({
    playerName: session.playerName,
    status: session.status,
    expiresAt: session.expiresAt,
    serverNow: Date.now(),
    maxPrefixLength: config.maxPrefixLength,
    rankPrefix: session.rankPrefix,
  });
});

// POST /api/prefix/:token  { prefixString } -> { ok: true }
router.post('/:token', express.json({ limit: '4kb' }), (req, res) => {
  const session = store.getSession(req.params.token);
  if (!session) {
    return res.status(410).json({ error: 'This link has expired. Run /prefix again in-game.' });
  }
  if (session.status !== 'pending') {
    return res.status(409).json({ error: `session is already ${session.status}` });
  }

  const format = 'legacy';
  const result = validatePrefixString(req.body && req.body.prefixString);
  if (!result.valid) {
    return res.status(400).json({ error: result.error });
  }

  const visibleText = extractVisibleText(result.value);
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
  // MiniMessage prefixes (a format that has since been removed) can't be
  // loaded into the builder, so don't offer them.
  const entries = history.getFor(session.playerUuid).filter((e) => e.format !== 'minimessage');
  res.json({ entries });
});

// POST /api/prefix/:token/close
// Sent via navigator.sendBeacon when the page is going away before
// saving. Only starts a short grace period (reloading the page cancels
// it) rather than killing the link outright; the hard TTL in sessionStore
// remains the authoritative expiry either way.
router.post('/:token/close', (req, res) => {
  store.scheduleCloseIfPending(req.params.token);
  // sendBeacon doesn't care about the response body; keep it minimal.
  res.status(204).end();
});

module.exports = router;
