'use strict';

/**
 * Strips color codes/tags from an already-validated prefix string, leaving
 * only the literal characters a player typed — this is what the word
 * filter checks, not the raw string (which is mostly hex codes/tag
 * syntax that would never match a blocked word anyway).
 */

function extractLegacyText(input) {
  let out = '';
  let i = 0;
  while (i < input.length) {
    if (input[i] === '&') {
      const next = input[i + 1];
      if (next === '#') {
        i += 8; // '&#RRGGBB'
        continue;
      }
      if (next !== undefined) {
        i += 2; // '&<code>'
        continue;
      }
    }
    out += input[i];
    i += 1;
  }
  return out;
}

function extractMiniMessageText(input) {
  let out = '';
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === '\\' && (input[i + 1] === '<' || input[i + 1] === '>' || input[i + 1] === '\\')) {
      out += input[i + 1];
      i += 2;
      continue;
    }
    if (ch === '<') {
      const close = input.indexOf('>', i + 1);
      if (close === -1) {
        // Shouldn't happen post-validation, but don't loop forever if it does.
        i += 1;
        continue;
      }
      i = close + 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** @param {'legacy'|'minimessage'} format */
function extractVisibleText(prefixString, format) {
  return format === 'minimessage' ? extractMiniMessageText(prefixString) : extractLegacyText(prefixString);
}

module.exports = { extractVisibleText };
