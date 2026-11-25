/**
 * Converts the segment-based prefix model into a LuckPerms-legacy hex
 * string, e.g.:
 *   &8[&#FF99CC&lF&#F58FD6&lE&#EB85E0&lM&#E07AEB&lB&#D670F5&lO&#CC66FF&lY&8] &7» &#CC66FF
 *
 * A segment is:
 *   {
 *     text: string,
 *     mode: 'solid' | 'gradient',
 *     colors: ['#RRGGBB', ...],   // 1 stop for solid; 2+ for a real gradient
 *     bold, italic, underline, strikethrough, obfuscated: boolean
 *   }
 *
 * The color code (and any active format codes) is re-emitted before EVERY
 * character, not just on change — legacy formatting codes are stateful in
 * Minecraft's renderer, and this way no segment can leak formatting into
 * the next one.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./color.js'));
  } else {
    root.PrefixSerialize = factory(root.PrefixColor);
  }
})(typeof self !== 'undefined' ? self : this, function (PrefixColor) {
  'use strict';

  const { gradientColors } = PrefixColor;

  // Fixed, stable emission order for format codes.
  const FORMAT_CODES = [
    ['bold', 'l'],
    ['italic', 'o'],
    ['underline', 'n'],
    ['strikethrough', 'm'],
    ['obfuscated', 'k'],
  ];

  function colorsForSegment(segment) {
    const count = segment.text.length || 1; // even empty text needs 1 color emitted
    if (segment.mode === 'gradient' && segment.colors.length >= 2) {
      return gradientColors(segment.colors, count);
    }
    return new Array(count).fill(segment.colors[0].toUpperCase());
  }

  function legacyFormatCodes(segment) {
    return FORMAT_CODES.filter(([key]) => segment[key])
      .map(([, code]) => `&${code}`)
      .join('');
  }

  function serializeSegments(segments) {
    let out = '';
    for (const segment of segments) {
      const colors = colorsForSegment(segment);
      const formatCodes = legacyFormatCodes(segment);

      if (segment.text.length === 0) {
        // "Trailing color with no visible text" case — still emit the code.
        out += `&${colors[0]}` + formatCodes;
        continue;
      }

      for (let i = 0; i < segment.text.length; i += 1) {
        out += `&${colors[i]}` + formatCodes + segment.text[i];
      }
    }
    return out;
  }

  return { serializeSegments };
});
