'use strict';

/**
 * Strips color codes from an already-validated legacy prefix string,
 * leaving only the literal characters a player typed — this is what the
 * word filter checks, not the raw string (which is mostly hex codes that
 * would never match a blocked word anyway).
 */
function extractVisibleText(input) {
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

module.exports = { extractVisibleText };
