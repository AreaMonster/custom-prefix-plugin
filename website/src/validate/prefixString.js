'use strict';

// Deliberately reads process.env directly rather than requiring
// ../config — that module also demands BACKEND_API_KEY be set (fine for
// the real server, which loads config.js before handling any request,
// but this validator should stay a dependency-free, independently
// testable module with no unrelated required secrets). See config.js for
// the full reasoning/safety margin behind this number.
const MAX_LENGTH = Number(process.env.MAX_PREFIX_LENGTH) > 0
  ? Number(process.env.MAX_PREFIX_LENGTH)
  : 160;

const LEGACY_CODE = /^[0-9a-fk-or]$/i;
const HEX_DIGITS = /^[0-9a-f]{6}$/i;

/**
 * Small state machine (not a blocklist): anything that isn't a well-formed
 * '&#RRGGBB' hex code, a well-formed '&<code>' legacy code, or a plain
 * printable character is rejected outright.
 */
function validateLegacy(input) {
  let i = 0;
  while (i < input.length) {
    const ch = input[i];

    if (ch === '&') {
      const next = input[i + 1];
      if (next === '#') {
        const hex = input.slice(i + 2, i + 8);
        if (hex.length === 6 && HEX_DIGITS.test(hex)) {
          i += 8; // consumed '&#RRGGBB'
          continue;
        }
        return { valid: false, error: `malformed hex color code at index ${i}` };
      }
      if (next !== undefined && LEGACY_CODE.test(next)) {
        i += 2; // consumed '&' + code char
        continue;
      }
      return { valid: false, error: `malformed legacy code at index ${i}` };
    }

    i += 1; // any other printable character is literal text content
  }
  return { valid: true };
}

/**
 * @param {unknown} input
 * @returns {{ valid: true, value: string } | { valid: false, error: string }}
 */
function validatePrefixString(input) {
  if (typeof input !== 'string') {
    return { valid: false, error: 'prefixString must be a string' };
  }
  if (input.length > MAX_LENGTH) {
    return { valid: false, error: `prefixString exceeds ${MAX_LENGTH} characters` };
  }
  if (input.length === 0) {
    return { valid: true, value: input }; // explicitly allowed: "clear my custom prefix"
  }

  // Control characters are never valid text content.
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return { valid: false, error: `control character at index ${i}` };
    }
  }

  const result = validateLegacy(input);
  if (!result.valid) return result;
  return { valid: true, value: input };
}

module.exports = { validatePrefixString, MAX_LENGTH };
