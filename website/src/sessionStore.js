'use strict';

const crypto = require('crypto');
const config = require('./config');

/**
 * @typedef {Object} Session
 * @property {string} token
 * @property {string} playerUuid
 * @property {string} playerName
 * @property {"pending"|"ready"|"applied"} status
 * @property {string|null} prefixString
 * @property {number} createdAt
 * @property {number} expiresAt
 * @property {number|null} appliedAt
 * @property {string|null} rankPrefix - the player's current (non-custom)
 *   rank prefix as reported by the plugin at session-creation time, used
 *   only to offer "start from my rank prefix" in the builder.
 * @property {number|null} closingAt - set when the page reports it was
 *   closed; the session dies at this time unless the page comes back.
 * @property {boolean} bypassFilter - true if the plugin reported this
 *   player holds the moderation-bypass permission at session-creation
 *   time. The website has no way to check LuckPerms permissions itself,
 *   so it trusts this flag from the plugin (which is itself gated behind
 *   the shared API key).
 */

/** @type {Map<string, Session>} */
const sessions = new Map();
// Secondary index so a new /prefix run can find and invalidate a player's
// previous still-active session.
/** @type {Map<string, string>} playerUuid -> token */
const activeByPlayer = new Map();

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// A closed/navigated-away tab doesn't kill the link instantly — it starts
// a short grace period that any reload or reopen of the page cancels.
// Browsers fire the same "page is going away" signal for a reload as for
// a real close, so expiring immediately made reloads (and, previously,
// simply switching tabs) destroy the link.
const CLOSE_GRACE_MS = 60_000;

function isExpired(session) {
  const now = Date.now();
  if (now > session.expiresAt) return true;
  return session.status === 'pending' && session.closingAt != null && now > session.closingAt;
}

function deleteSession(token) {
  const session = sessions.get(token);
  if (!session) return;
  sessions.delete(token);
  // Only clear the player index if it still points at this token (a newer
  // session for the same player may have already replaced it).
  if (activeByPlayer.get(session.playerUuid) === token) {
    activeByPlayer.delete(session.playerUuid);
  }
}

/**
 * Create a new session for a player, invalidating any prior pending/ready
 * session that player already had (so stale links stop working).
 */
function createSession(playerUuid, playerName, bypassFilter = false, rankPrefix = null) {
  const priorToken = activeByPlayer.get(playerUuid);
  if (priorToken) {
    deleteSession(priorToken);
  }

  const token = generateToken();
  const now = Date.now();
  /** @type {Session} */
  const session = {
    token,
    playerUuid,
    playerName,
    status: 'pending',
    prefixString: null,
    createdAt: now,
    expiresAt: now + config.sessionTtlMs,
    appliedAt: null,
    bypassFilter: !!bypassFilter,
    rankPrefix,
    closingAt: null,
  };
  sessions.set(token, session);
  activeByPlayer.set(playerUuid, token);
  return session;
}

/**
 * Fetch a session, treating an expired-but-not-yet-swept session as gone.
 * This makes expiry correct even between sweep ticks.
 */
function getSession(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (isExpired(session)) {
    deleteSession(token);
    return null;
  }
  return session;
}

function markReady(token, prefixString) {
  const session = getSession(token);
  if (!session) return null;
  session.status = 'ready';
  session.prefixString = prefixString;
  return session;
}

function markApplied(token) {
  const session = getSession(token);
  if (!session) return null;
  session.status = 'applied';
  session.appliedAt = Date.now();
  // The plugin has consumed it — free it immediately rather than waiting
  // for TTL sweep.
  deleteSession(token);
  return session;
}

/**
 * Called when the browser reports the page went away. Only schedules the
 * link to die after a grace period (see CLOSE_GRACE_MS), and only if the
 * player never saved — don't cancel a save that's already in flight to
 * the plugin. Reopening/reloading the page calls cancelClose().
 */
function scheduleCloseIfPending(token) {
  const session = getSession(token);
  if (!session || session.status !== 'pending') return;
  session.closingAt = Date.now() + CLOSE_GRACE_MS;
}

function cancelClose(token) {
  const session = sessions.get(token);
  if (session) session.closingAt = null;
}

function sweepExpired() {
  for (const [token, session] of sessions) {
    if (isExpired(session)) {
      deleteSession(token);
    }
  }
}

const sweepInterval = setInterval(sweepExpired, 30_000);
sweepInterval.unref?.();

module.exports = {
  createSession,
  getSession,
  markReady,
  markApplied,
  deleteSession,
  scheduleCloseIfPending,
  cancelClose,
  _sweepExpired: sweepExpired, // exposed for tests
};
