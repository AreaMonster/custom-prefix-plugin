'use strict';

const crypto = require('crypto');
const config = require('../config');
const adminSessions = require('../adminSessions');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest();
}

const expectedApiKeyDigest = sha256(config.backendApiKey);

/**
 * Protects the plugin-facing /api/sessions* routes. Requires an
 * X-API-Key header matching BACKEND_API_KEY, compared via a hashed
 * constant-time comparison so response timing doesn't leak how much of
 * the key was guessed correctly.
 */
function requireApiKey(req, res, next) {
  const provided = req.get('X-API-Key');
  if (!provided) {
    return res.status(401).json({ error: 'missing X-API-Key header' });
  }

  const providedDigest = sha256(provided);
  const match = crypto.timingSafeEqual(providedDigest, expectedApiKeyDigest);
  if (!match) {
    return res.status(401).json({ error: 'invalid API key' });
  }

  next();
}

/**
 * Constant-time string equality via hashed digests — same rationale as
 * requireApiKey above. Used by the admin login route to compare the
 * submitted username/password against configured values.
 */
function timingSafeStringEqual(a, b) {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

/**
 * Protects admin-only routes (the audit log). Requires an X-Admin-Token
 * header naming a session created by POST /api/admin/login — deliberately
 * a separate credential space from the plugin's X-API-Key, so admins
 * never need to know/paste the plugin's shared secret.
 */
function requireAdminSession(req, res, next) {
  const token = req.get('X-Admin-Token');
  if (!token || !adminSessions.isValid(token)) {
    return res.status(401).json({ error: 'not logged in or session expired' });
  }
  next();
}

module.exports = { requireApiKey, requireAdminSession, timingSafeStringEqual };
