'use strict';

const crypto = require('crypto');

// Short-lived, single-use tokens created by the plugin when a permitted
// player runs '/prefix admin' — deliberately separate from adminSessions
// (which last 12h once you're actually logged in). Keeping the link
// itself short-lived and single-use limits exposure if it ever leaks
// (e.g. through Minecraft chat logs), since redeeming it immediately
// invalidates it and hands back a real, independent admin session token.
const LINK_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** @type {Map<string, { expiresAt: number, playerUuid: string, playerName: string }>} */
const links = new Map();

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function create(playerUuid, playerName) {
  const token = generateToken();
  const expiresAt = Date.now() + LINK_TTL_MS;
  links.set(token, { expiresAt, playerUuid, playerName });
  return { token, expiresAt };
}

/** Validates and consumes a link in one step — a token can only ever redeem once. */
function redeem(token) {
  const link = links.get(token);
  if (!link) return null;
  links.delete(token); // single-use regardless of outcome
  if (Date.now() > link.expiresAt) return null;
  return link;
}

function sweepExpired() {
  const now = Date.now();
  for (const [token, link] of links) {
    if (now > link.expiresAt) links.delete(token);
  }
}

const sweepInterval = setInterval(sweepExpired, 60_000);
sweepInterval.unref?.();

module.exports = { create, redeem };
