/**
 * The inverse of serialize.js: turns an already-saved prefix string back
 * into the segment-array model the builder UI edits, so a history entry
 * can be loaded into the editor and tweaked rather than only ever being
 * reapplied verbatim.
 *
 * MiniMessage round-trips losslessly — its tags already encode segments
 * directly, including the exact gradient stop list. Legacy hex is lossier
 * for gradients: the saved string only has each character's final color,
 * not which characters originally belonged to one gradient segment vs.
 * separate solid segments that just happen to sit next to each other. See
 * the comment above parseLegacyToSegments for how that's handled.
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

  // ---------- Legacy hex ----------

  /**
   * Colors alone can't tell us where one original segment ended and the
   * next began — legacy output has no boundary markers, and a decorative
   * character's color can easily differ from its neighbor's just as
   * "smoothly" as a real gradient's would. Two rules keep reconstruction
   * both safe (never merges characters that don't actually belong
   * together) and useful (still recognizes the common case):
   *
   *  1. Any run of 2+ consecutive same-format characters sharing the
   *     EXACT same color is always a solid segment — unambiguous.
   *  2. Otherwise, try the longest run starting here (down to a minimum
   *     of 3 characters) whose colors are EXACTLY reproduced by our own
   *     2-stop linear interpolation between its first and last color —
   *     i.e. only accept it as a gradient if replaying our own generator
   *     with those two colors would recreate what's actually there. This
   *     is why a decorative character can't get swept into a neighboring
   *     gradient by coincidence: its presence breaks the exact-fit check,
   *     so the search keeps shrinking the window until it either finds a
   *     genuine fit or gives up. Only 2 stops are ever reconstructed even
   *     if the original had more (3+-stop originals degrade gracefully
   *     into per-character solid segments instead — still byte-identical
   *     on re-save, just not editable as one gradient control).
   */
  function parseLegacyToSegments(input) {
    /** @type {Array<{ch: string|null, color: string} & ReturnType<typeof blankFormat>>} */
    const records = [];
    let i = 0;
    let color = '#FFFFFF';

    while (i < input.length) {
      const fmt = blankFormat();
      while (input[i] === '&' && i + 1 < input.length) {
        const next = input[i + 1];
        if (next === '#' && input.length >= i + 8) {
          color = `#${input.slice(i + 2, i + 8).toUpperCase()}`;
          i += 8;
        } else if (next === 'l') { fmt.bold = true; i += 2; }
        else if (next === 'o') { fmt.italic = true; i += 2; }
        else if (next === 'n') { fmt.underline = true; i += 2; }
        else if (next === 'm') { fmt.strikethrough = true; i += 2; }
        else if (next === 'k') { fmt.obfuscated = true; i += 2; }
        else { i += 2; } // unrecognized code, skip defensively
      }
      if (i >= input.length) {
        records.push({ ch: null, color, ...fmt });
        break;
      }
      records.push({ ch: input[i], color, ...fmt });
      i += 1;
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

  // ---------- MiniMessage ----------

  const FORMAT_TAG_NAMES = {
    bold: ['bold', 'b'], italic: ['italic', 'i', 'em'], underline: ['underlined', 'u'],
    strikethrough: ['strikethrough', 'st'], obfuscated: ['obfuscated', 'obf'],
  };

  function formatKeyForTag(name) {
    for (const key of FORMAT_KEYS) {
      if (FORMAT_TAG_NAMES[key].includes(name)) return key;
    }
    return null;
  }

  function parseMiniMessageToSegments(input) {
    const segments = [];
    let i = 0;

    while (i < input.length) {
      if (input[i] !== '<') { i += 1; continue; } // stray text outside any tag, ignore defensively

      const close = input.indexOf('>', i + 1);
      if (close === -1) break;
      const tagContent = input.slice(i + 1, close);
      i = close + 1;

      let colors;
      let closingName;
      if (tagContent.toLowerCase().startsWith('gradient:')) {
        colors = tagContent.slice('gradient:'.length).split(':').map((c) => c.toUpperCase());
        closingName = 'gradient';
      } else {
        colors = [tagContent.toUpperCase()];
        closingName = tagContent;
      }

      const fmt = blankFormat();
      let text = '';
      const closeTag = `</${closingName}>`.toLowerCase();
      while (i < input.length) {
        if (input.slice(i, i + closeTag.length).toLowerCase() === closeTag) {
          i += closeTag.length;
          break;
        }
        if (input[i] === '\\' && (input[i + 1] === '<' || input[i + 1] === '>' || input[i + 1] === '\\')) {
          text += input[i + 1];
          i += 2;
          continue;
        }
        if (input[i] === '<') {
          const c2 = input.indexOf('>', i + 1);
          if (c2 === -1) { i += 1; continue; }
          const inner = input.slice(i + 1, c2);
          i = c2 + 1;
          const isClosing = inner.startsWith('/');
          const name = (isClosing ? inner.slice(1) : inner).toLowerCase();
          const key = formatKeyForTag(name);
          // Only opening tags set a flag; closing tags are just consumed.
          // Our own output never toggles a format tag on/off more than
          // once per segment, so there's no real scoping to track, and
          // treating a close tag as "set false" would wipe out the flag
          // the matching open tag just recorded.
          if (key && !isClosing) fmt[key] = true;
          continue;
        }
        text += input[i];
        i += 1;
      }

      segments.push({
        text,
        mode: colors.length > 1 ? 'gradient' : 'solid',
        colors,
        ...fmt,
      });
    }
    return segments;
  }

  /** @param {'legacy'|'minimessage'} format */
  function parseToSegments(prefixString, format) {
    return format === 'minimessage' ? parseMiniMessageToSegments(prefixString) : parseLegacyToSegments(prefixString);
  }

  return { parseToSegments };
});
