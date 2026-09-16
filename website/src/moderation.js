'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Words/phrases commonly used to impersonate server staff in a fake
// "rank" prefix. These are just role names, not offensive content, so
// they're safe to ship as sane defaults — unlike a profanity/slur list,
// which is left entirely to the admin (see moderation.words.example.txt)
// rather than authored here.
const STAFF_IMPERSONATION_DEFAULTS = [
  'owner', 'admin', 'administrator', 'administration',
  'moderator', 'headmoderator', 'headadmin', 'staff',
  'developer', 'founder', 'manager', 'official',
  'sysadmin', 'operator', 'ceo', 'president',
];

const LEET_MAP = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '|': 'i' };

/**
 * Lowercases, maps common leetspeak substitutions, then strips everything
 * that isn't a-z — this collapses spaced-out ("o w n e r"), punctuated
 * ("adm-in"), and lightly-leeted ("0wner") evasion attempts down to the
 * same normalized form as the plain word, without being a full anti-evasion
 * system (that's an unwinnable arms race; this catches the obvious cases).
 */
function normalize(text) {
  let out = '';
  for (const ch of text.toLowerCase()) {
    out += LEET_MAP[ch] ?? ch;
  }
  return out.replace(/[^a-z]/g, '');
}

const CUSTOM_WORDS_FILE = path.join(__dirname, '..', 'moderation.words.txt');

function loadCustomWords() {
  try {
    const raw = fs.readFileSync(CUSTOM_WORDS_FILE, 'utf8');
    const words = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map(normalize)
      .filter(Boolean);
    logger.info(`Loaded ${words.length} custom moderation term(s) from moderation.words.txt`);
    return words;
  } catch (err) {
    // No file configured yet — fine, just the built-in defaults apply.
    return [];
  }
}

const blockedTerms = [
  ...STAFF_IMPERSONATION_DEFAULTS.map(normalize),
  ...loadCustomWords(),
];

/**
 * @param {string} visibleText already-extracted literal text (no color
 *   codes/tags) — see textExtract.js.
 * @returns {{ blocked: boolean, term?: string }} `term` is the matched
 *   blocked term, useful for the admin audit log — never shown to the
 *   player, so as not to hand them a map of exactly what to tweak to
 *   bypass the filter.
 */
function checkText(visibleText) {
  const normalized = normalize(visibleText);
  if (!normalized) return { blocked: false };
  for (const term of blockedTerms) {
    if (term && normalized.includes(term)) {
      return { blocked: true, term };
    }
  }
  return { blocked: false };
}

module.exports = { checkText };
