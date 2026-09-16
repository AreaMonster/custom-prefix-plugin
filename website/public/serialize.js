/**
 * Converts the segment-based prefix model into either:
 *   - LuckPerms-legacy hex, e.g.
 *     &8[&#FF99CC&lF&#F58FD6&lE&#EB85E0&lM&#E07AEB&lB&#D670F5&lO&#CC66FF&lY&8] &7» &#CC66FF
 *   - MiniMessage, e.g.
 *     <#555555>[<gradient:#FF99CC:#CC66FF><b>FEMBOY</b></gradient><#555555>]
 *
 * A segment is:
 *   {
 *     text: string,
 *     mode: 'solid' | 'gradient',
 *     colors: ['#RRGGBB', ...],   // 1 stop for solid; 2+ for a real gradient
 *     bold, italic, underline, strikethrough, obfuscated: boolean
 *   }
 *
 * Which format a saved prefix ends up in makes no difference to the
 * backend/plugin — LuckPerms stores whatever string it's given as an
 * opaque value either way. Only whatever *renders* your chat/tab list
 * needs to understand the format you pick.
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

  // Fixed, stable emission order for format codes/tags.
  const FORMAT_CODES = [
    ['bold', 'l'],
    ['italic', 'o'],
    ['underline', 'n'],
    ['strikethrough', 'm'],
    ['obfuscated', 'k'],
  ];
  const FORMAT_TAGS = [
    ['bold', 'bold'],
    ['italic', 'italic'],
    ['underline', 'underlined'],
    ['strikethrough', 'strikethrough'],
    ['obfuscated', 'obfuscated'],
  ];

  function colorsForSegment(segment) {
    const count = segment.text.length || 1; // even empty text needs 1 color emitted (legacy only)
    if (segment.mode === 'gradient' && segment.colors.length >= 2) {
      return gradientColors(segment.colors, count);
    }
    return new Array(count).fill(segment.colors[0].toUpperCase());
  }

  // ---------- Legacy hex (&#RRGGBB per character) ----------

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

  // ---------- MiniMessage (<gradient:...>/<#RRGGBB> + tags) ----------

  // Only '<', '>' and '\' need escaping inside literal text content so a
  // player can't break out of/inject tags via the text they type.
  function escapeMiniMessageText(text) {
    return text.replace(/\\/g, '\\\\').replace(/</g, '\\<').replace(/>/g, '\\>');
  }

  function serializeMiniMessage(segments) {
    let out = '';
    for (const segment of segments) {
      if (segment.text.length === 0) continue; // no "colored empty span" concept in MiniMessage

      const isGradient = segment.mode === 'gradient' && segment.colors.length >= 2;
      const colorTagOpen = isGradient
        ? `<gradient:${segment.colors.map((c) => c.toUpperCase()).join(':')}>`
        : `<${segment.colors[0].toUpperCase()}>`;
      const colorTagClose = isGradient ? '</gradient>' : `</${segment.colors[0].toUpperCase()}>`;

      const activeTags = FORMAT_TAGS.filter(([key]) => segment[key]).map(([, tag]) => tag);
      const openTags = activeTags.map((t) => `<${t}>`).join('');
      const closeTags = activeTags.map((t) => `</${t}>`).reverse().join('');

      out += colorTagOpen + openTags + escapeMiniMessageText(segment.text) + closeTags + colorTagClose;
    }
    return out;
  }

  return { serializeSegments, serializeMiniMessage };
});
