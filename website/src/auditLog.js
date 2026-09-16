'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Persisted (JSON-lines, one entry per line) so "which player changed to
// which prefix" survives a restart — unlike sessions, this is meant to be
// a durable record. Also mirrored to the process's own stdout/stderr via
// logger, so `docker compose logs -f` shows activity immediately without
// needing the admin page at all.
const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'audit.log');
const MAX_IN_MEMORY = 500;

/** @type {Array<object>} newest first */
let entries = [];

function loadRecentFromDisk() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    entries = lines
      .slice(-MAX_IN_MEMORY)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (err) {
          return null; // skip a corrupt line rather than fail the whole load
        }
      })
      .filter(Boolean)
      .reverse();
  } catch (err) {
    entries = []; // no file yet — fine, starts empty
  }
}

/**
 * @param {object} entry - { playerUuid, playerName, format, prefixString,
 *   outcome: 'saved'|'blocked'|'admin_access', term? }
 */
function record(entry) {
  const full = { ...entry, at: Date.now() };

  entries.unshift(full);
  if (entries.length > MAX_IN_MEMORY) entries.length = MAX_IN_MEMORY;

  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(FILE, `${JSON.stringify(full)}\n`, 'utf8');
  } catch (err) {
    logger.error('[auditLog] failed to persist entry:', err.message);
  }

  const who = `${full.playerName} (${full.playerUuid})`;
  if (full.outcome === 'blocked') {
    logger.warn(`[audit] BLOCKED ${who} — prefix contained a blocked term ('${full.term}'): ${full.prefixString}`);
  } else if (full.outcome === 'admin_access') {
    logger.info(`[audit] ${who} accessed the admin panel via /prefix admin`);
  } else {
    logger.info(`[audit] ${who} saved a new ${full.format} prefix: ${full.prefixString}`);
  }
}

function list(limit) {
  const n = Math.min(Math.max(Number(limit) || 50, 1), MAX_IN_MEMORY);
  return entries.slice(0, n);
}

loadRecentFromDisk();

module.exports = { record, list };
