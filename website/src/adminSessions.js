'use strict';

const crypto = require('crypto');

// Admin login sessions — deliberately separate from sessionStore.js
// (player links) and from BACKEND_API_KEY (the plugin's own credential).
// In-memory only: an admin session resets on restart, same as player
// links, which is fine — worst case you just log in again.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/** @type {Map<string, { createdAt: number, expiresAt: number }>} */
const sessions = new Map();

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function create() {
  const token = generateToken();
  const now = Date.now();
  sessions.set(token, { createdAt: now, expiresAt: now + SESSION_TTL_MS });
  return { token, expiresAt: now + SESSION_TTL_MS };
}

function isValid(token) {
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function destroy(token) {
  sessions.delete(token);
}

function sweepExpired() {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now > session.expiresAt) sessions.delete(token);
  }
}

const sweepInterval = setInterval(sweepExpired, 5 * 60_000);
sweepInterval.unref?.();

module.exports = { create, isValid, destroy };
