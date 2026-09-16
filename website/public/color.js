/**
 * Pure color helpers shared by the browser UI and by the Node-run unit
 * tests in website/test/. No DOM access here on purpose.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PrefixColor = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  /** '#RRGGBB' or 'RRGGBB' -> {r,g,b} (0-255 each) */
  function hexToRgb(hex) {
    const clean = String(hex).replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
      throw new Error(`invalid hex color: ${hex}`);
    }
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }

  /** {r,g,b} -> '#RRGGBB' (uppercase, zero-padded) */
  function rgbToHex({ r, g, b }) {
    const toHex = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }

  /**
   * Linear-interpolates a single color at position t (0..1) across an
   * ordered list of 1+ stop colors, piecewise between consecutive stops —
   * the same algorithm MiniMessage's own <gradient:...> tag uses for N
   * stops, so the preview matches what a MiniMessage-aware chat plugin
   * would actually render.
   */
  function colorAt(stops, t) {
    if (stops.length === 1) return rgbToHex(hexToRgb(stops[0]));
    const clamped = clamp(t, 0, 1);
    const segments = stops.length - 1;
    const scaled = clamped * segments;
    const i = Math.min(Math.floor(scaled), segments - 1);
    const localT = scaled - i;
    const a = hexToRgb(stops[i]);
    const b = hexToRgb(stops[i + 1]);
    return rgbToHex({
      r: a.r + (b.r - a.r) * localT,
      g: a.g + (b.g - a.g) * localT,
      b: a.b + (b.b - a.b) * localT,
    });
  }

  /**
   * Returns `count` hex colors sampled evenly across an ordered list of
   * 1+ stop colors. count === 1 samples the first stop. count === 0
   * returns []. A single stop just repeats that color `count` times
   * (equivalent to "solid").
   */
  function gradientColors(stops, count) {
    if (count <= 0) return [];
    if (count === 1) return [colorAt(stops, 0)];
    const colors = [];
    for (let i = 0; i < count; i += 1) {
      colors.push(colorAt(stops, i / (count - 1)));
    }
    return colors;
  }

  return { hexToRgb, rgbToHex, gradientColors };
});
