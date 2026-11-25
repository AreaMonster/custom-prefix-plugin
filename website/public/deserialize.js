/**
 * The inverse of serialize.js: turns an already-saved legacy prefix string
 * back into the segment-array model the builder UI edits, so a history
 * entry (or the player's current rank prefix) can be loaded into the
 * editor and tweaked rather than only ever being reapplied verbatim.
 *
 * Understands everything a LuckPerms legacy prefix can contain, not just
 * this tool's own output: '&#RRGGBB', BungeeCord-style '&x&R&R&G&G&B&B',
 * the 16 classic color codes ('&0'-'&f'), format codes ('&l&o&n&m&k') and
 * '&r'. As in Minecraft, a color code resets any formatting set before it.
 *
 * Legacy output has no segment boundary markers (just a color per
 * character), so which characters originally belonged to one gradient is
 * recovered heuristically — see the comment above parseLegacyToSegments.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./color.js'));
  } else {
    root.PrefixDeserialize = factory(root.PrefixColor);
  }
})(typeof self !== 'undefined' ? self : this, function (PrefixColor) {
  'use strict';

  const FORMAT_KEYS = ['bold', 'italic', 'underline', 'strikethrough', 'obfuscated'];
  const FORMAT_FLAG = { l: 'bold', o: 'italic', n: 'underline', m: 'strikethrough', k: 'obfuscated' };
  const DEFAULT_COLOR = '#FFFFFF';
  const VANILLA_COLORS = {
    0: '#000000', 1: '#0000AA', 2: '#00AA00', 3: '#00AAAA',
    4: '#AA0000', 5: '#AA00AA', 6: '#FFAA00', 7: '#AAAAAA',
    8: '#555555', 9: '#5555FF', a: '#55FF55', b: '#55FFFF',
    c: '#FF5555', d: '#FF55FF', e: '#FFFF55', f: '#FFFFFF',
  };

  function sameFormat(a, b) {
    return FORMAT_KEYS.every((k) => a[k] === b[k]);
  }

  function blankFormat() {
    return { bold: false, italic: false, underline: false, strikethrough: false, obfuscated: false };
  }

  function pickFormat(rec) {
    return {
      bold: rec.bold, italic: rec.italic, underline: rec.underline,
      strikethrough: rec.strikethrough, obfuscated: rec.obfuscated,
    };
  }

  /**
   * Colors alone can't tell us where one original segment ended and the
   * next began, and a decorative character's color can easily differ from
   * its neighbor's just as "smoothly" as a real gradient's would. Two
   * rules keep reconstruction both safe (never merges characters that
   * don't actually belong together) and useful (still recognizes the
   * common case):
   *
   *  1. Any run of 2+ consecutive same-format characters sharing the
   *     EXACT same color is always a solid segment — unambiguous.
   *  2. Otherwise, try the longest run starting here (down to a minimum
   *     of 3 characters) whose colors are EXACTLY reproduced by our own
   *     2-stop linear interpolation between its first and last color —
   *     i.e. only accept it as a gradient if replaying our own generator
   *     with those two colors would recreate what's actually there. A
   *     neighboring decorative character breaks the exact-fit check, so
   *     the search keeps shrinking the window until it finds a genuine
   *     fit or gives up. Only 2 stops are ever reconstructed even if the
   *     original had more (3+-stop originals degrade gracefully into
   *     per-character solid segments — still byte-identical on re-save,
   *     just not editable as one gradient control).
   */
  function parseLegacyToSegments(input) {
    /** @type {Array<{ch: string|null, color: string} & ReturnType<typeof blankFormat>>} */
    const records = [];
    let color = DEFAULT_COLOR;
    let fmt = blankFormat();
    let codesSinceLastChar = false;
    let i = 0;

    while (i < input.length) {
      if (input[i] === '&') {
        const next = (input[i + 1] || '').toLowerCase();

        if (next === '#' && /^[0-9a-f]{6}$/i.test(input.slice(i + 2, i + 8))) {
          color = `#${input.slice(i + 2, i + 8).toUpperCase()}`;
          fmt = blankFormat();
          i += 8;
          codesSinceLastChar = true;
          continue;
        }
        if (next === 'x') {
          const m = /^&x(?:&[0-9a-f]){6}/i.exec(input.slice(i));
          if (m) {
            color = `#${m[0].slice(2).replace(/&/g, '').toUpperCase()}`;
            fmt = blankFormat();
            i += m[0].length;
            codesSinceLastChar = true;
            continue;
          }
        }
        if (Object.prototype.hasOwnProperty.call(VANILLA_COLORS, next)) {
          color = VANILLA_COLORS[next];
          fmt = blankFormat();
          i += 2;
          codesSinceLastChar = true;
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(FORMAT_FLAG, next)) {
          fmt = { ...fmt, [FORMAT_FLAG[next]]: true };
          i += 2;
          codesSinceLastChar = true;
          continue;
        }
        if (next === 'r') {
          color = DEFAULT_COLOR;
          fmt = blankFormat();
          i += 2;
          codesSinceLastChar = true;
          continue;
        }
        i += 1; // not a recognized code: drop the lone '&'
        continue;
      }

      records.push({ ch: input[i], color, ...fmt });
      codesSinceLastChar = false;
      i += 1;
    }
    if (codesSinceLastChar) {
      records.push({ ch: null, color, ...fmt }); // trailing color with no character
    }

    const segments = [];
    let idx = 0;
    while (idx < records.length) {
      const rec = records[idx];
      if (rec.ch === null) {
        segments.push({ text: '', mode: 'solid', colors: [rec.color], ...blankFormat() });
        idx += 1;
        continue;
      }

      // Rule 1: maximal run of exact-same color (same format) => solid.
      let solidEnd = idx + 1;
      while (
        solidEnd < records.length &&
        records[solidEnd].ch !== null &&
        sameFormat(records[solidEnd], rec) &&
        records[solidEnd].color === rec.color
      ) {
        solidEnd += 1;
      }
      if (solidEnd - idx >= 2) {
        const text = records.slice(idx, solidEnd).map((r) => r.ch).join('');
        segments.push({ text, mode: 'solid', colors: [rec.color], ...pickFormat(rec) });
        idx = solidEnd;
        continue;
      }

      // Rule 2: search for the longest validated 2-stop gradient window.
      let maxEnd = idx + 1;
      while (
        maxEnd < records.length &&
        records[maxEnd].ch !== null &&
        sameFormat(records[maxEnd], rec) &&
        records[maxEnd].color !== records[maxEnd - 1].color
      ) {
        maxEnd += 1;
      }

      let matched = null;
      for (let end = maxEnd; end >= idx + 3; end -= 1) {
        const window = records.slice(idx, end);
        const actual = window.map((r) => r.color);
        const stops = [actual[0], actual[actual.length - 1]];
        const predicted = PrefixColor.gradientColors(stops, actual.length);
        if (predicted.every((c, k) => c === actual[k])) {
          matched = { end, stops };
          break;
        }
      }

      if (matched) {
        const text = records.slice(idx, matched.end).map((r) => r.ch).join('');
        segments.push({ text, mode: 'gradient', colors: matched.stops, ...pickFormat(rec) });
        idx = matched.end;
        continue;
      }

      // Nothing matched confidently — this character stands alone.
      segments.push({ text: rec.ch, mode: 'solid', colors: [rec.color], ...pickFormat(rec) });
      idx += 1;
    }
    return segments;
  }

  return { parseToSegments: parseLegacyToSegments };
});
