'use strict';

const fs = require('fs');
const path = require('path');

// Unlike sessionStore (deliberately ephemeral), history is meant to
// survive a restart, so it's persisted to a small JSON file rather than
// kept purely in memory. If you're running this in Docker, mount
// website/data as a volume (see docker-compose.yml) or this resets every
// time the container is rebuilt.
const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'history.json');
const MAX_PER_PLAYER = 5;

/** @type {Object<string, Array<{prefixString: string, format: string, savedAt: number}>>} */
let history = {};

function load() {
  try {
    history = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (err) {
    // Missing file (first run) or corrupt content — start fresh rather
    // than crash the server over what's a nice-to-have feature.
    history = {};
  }
}

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    // Write to a temp file then rename — avoids leaving a truncated/
    // corrupt history.json if the process dies mid-write.
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(history), 'utf8');
    fs.renameSync(tmp, FILE);
  } catch (err) {
    // Best effort: never let a disk/permissions problem break saving a
    // prefix just because we couldn't also record history for it.
    // eslint-disable-next-line no-console
    console.error('[historyStore] failed to persist history:', err.message);
  }
}

/**
 * Records a newly-saved prefix for a player, capped at MAX_PER_PLAYER
 * (oldest dropped first). Skips adding a duplicate if it's identical to
 * the most recent entry (re-saving the same design shouldn't clutter the
 * list).
 */
function record(playerUuid, { prefixString, format }) {
  const list = history[playerUuid] || [];
  const top = list[0];
  if (top && top.prefixString === prefixString && top.format === format) {
    return; // unchanged from the last save, nothing new to record
  }
  list.unshift({ prefixString, format, savedAt: Date.now() });
  history[playerUuid] = list.slice(0, MAX_PER_PLAYER);
  persist();
}

/** Returns up to MAX_PER_PLAYER entries, newest first. Never another player's. */
function getFor(playerUuid) {
  return history[playerUuid] || [];
}

load();

module.exports = { record, getFor };
