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

// ---------- Legacy hex (&#RRGGBB per character) ----------

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

// ---------- MiniMessage (<gradient:...>/<#RRGGBB> + format tags) ----------

// Only the tags this tool itself ever generates. Deliberately does NOT
// include anything interactive/behavioral (click, hover, insert, key,
// selector, nbt, ...) — the prefix string is player-controlled, and if
// whatever eventually renders it (a chat/tab plugin) parses it with a
// permissive MiniMessage resolver, an unrestricted tag set would be a real
// injection vector (e.g. a fake '<click:run_command:...>'). Same
// "allowlist state machine, not blocklist" approach as the legacy
// validator above.
const MINIMESSAGE_TAG_NAMES = new Set([
  'gradient',
  'bold', 'b',
  'italic', 'i', 'em',
  'underlined', 'u',
  'strikethrough', 'st',
  'obfuscated', 'obf',
]);
const HEX_TAG = /^#[0-9a-f]{6}$/i;

function isSafeMiniMessageTag(rawContent, isClosing) {
  // rawContent is whatever was between '<' and '>', not counting a
  // leading '/' for closing tags (that's stripped by the caller, but
  // isClosing still tells us which case we're in).
  const name = rawContent.split(':')[0].trim().toLowerCase();
  if (HEX_TAG.test(name)) return true; // '<#RRGGBB>'/'</#RRGGBB>' shorthand color tag
  if (!MINIMESSAGE_TAG_NAMES.has(name)) return false;
  if (name === 'gradient' && !isClosing) {
    // Every argument after 'gradient:' must itself be a valid hex color —
    // this is also where a multi-stop gradient's stop list lives. Closing
    // tags ('</gradient>') never carry args, so this only applies when
    // opening.
    const parts = rawContent.split(':').slice(1);
    if (parts.length < 1) return false;
    return parts.every((p) => HEX_TAG.test(p.trim()));
  }
  return true;
}

function validateMiniMessage(input) {
  let i = 0;
  while (i < input.length) {
    const ch = input[i];

    if (ch === '\\') {
      const next = input[i + 1];
      if (next === '<' || next === '>' || next === '\\') {
        i += 2; // escaped literal character
        continue;
      }
      return { valid: false, error: `stray backslash at index ${i}` };
    }

    if (ch === '<') {
      const close = input.indexOf('>', i + 1);
      if (close === -1) {
        return { valid: false, error: `unterminated tag at index ${i}` };
      }
      let content = input.slice(i + 1, close);
      const isClosing = content.startsWith('/');
      if (isClosing) content = content.slice(1);
      if (!isSafeMiniMessageTag(content, isClosing)) {
        return { valid: false, error: `disallowed or malformed tag '<${content}>' at index ${i}` };
      }
      i = close + 1;
      continue;
    }

    if (ch === '>') {
      return { valid: false, error: `unexpected '>' at index ${i}` };
    }

    i += 1; // any other printable character is literal text content
  }
  return { valid: true };
}

/**
 * @param {unknown} input
 * @param {'legacy'|'minimessage'} format
 * @returns {{ valid: true, value: string } | { valid: false, error: string }}
 */
function validatePrefixString(input, format) {
  if (typeof input !== 'string') {
    return { valid: false, error: 'prefixString must be a string' };
  }
  if (input.length > MAX_LENGTH) {
    return { valid: false, error: `prefixString exceeds ${MAX_LENGTH} characters` };
  }
  if (input.length === 0) {
    return { valid: true, value: input }; // explicitly allowed: "clear my custom prefix"
  }

  // Control characters are never valid text content, in either format.
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return { valid: false, error: `control character at index ${i}` };
    }
  }

  const result = format === 'minimessage' ? validateMiniMessage(input) : validateLegacy(input);
  if (!result.valid) return result;
  return { valid: true, value: input };
}

module.exports = { validatePrefixString, MAX_LENGTH };
