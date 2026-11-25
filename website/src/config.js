'use strict';

require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return value.trim();
}

const port = Number(process.env.PORT || 8080);
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '');
const backendApiKey = required('BACKEND_API_KEY');

// TEST_TTL_MS is an escape hatch for automated tests only, so we don't have
// to wait 20 real minutes to exercise expiry behavior. Never set this in
// production.
const testTtlMs = process.env.TEST_TTL_MS ? Number(process.env.TEST_TTL_MS) : null;
const sessionTtlMs = testTtlMs && testTtlMs > 0
  ? testTtlMs
  : Number(process.env.SESSION_TTL_MINUTES || 20) * 60 * 1000;

// LuckPerms stores a prefix wrapped as "prefix.<priority>.<value>" in a
// single database column that defaults to VARCHAR(200) on MySQL/MariaDB.
// 160 leaves ~40 chars of headroom under that default for the wrapper
// (~11-15 chars) plus margin for LuckPerms' own internal escaping. Raise
// this yourself (MAX_PREFIX_LENGTH in .env) if you want more — up to
// ~185 is still reasonably safe against an unmodified default schema,
// beyond that you're gambling unless you've actually widened the column.
// Note the legacy format repeats a full '&#RRGGBB' code per character, so a
// long gradient word uses this budget quickly — that's the real limit on
// how many colored letters fit.
const maxPrefixLength = Number(process.env.MAX_PREFIX_LENGTH) > 0
  ? Number(process.env.MAX_PREFIX_LENGTH)
  : 160;

// Deliberately optional (unlike BACKEND_API_KEY) rather than required —
// making this mandatory would crash the whole server on startup for
// anyone who upgrades without immediately setting it. Left unset, the
// admin login route just responds with a clear "not configured" message
// instead of ever succeeding.
const adminUsername = process.env.ADMIN_USERNAME ? process.env.ADMIN_USERNAME.trim() : null;
const adminPassword = process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.trim() : null;

module.exports = {
  port,
  publicBaseUrl,
  backendApiKey,
  sessionTtlMs,
  maxPrefixLength,
  adminUsername,
  adminPassword,
};
