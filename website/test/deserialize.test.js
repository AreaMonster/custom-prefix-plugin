'use strict';

// Run with: npm test

const assert = require('node:assert/strict');
const { serializeSegments, serializeMiniMessage } = require('../public/serialize.js');
const { parseToSegments } = require('../public/deserialize.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function seg(overrides) {
  return Object.assign(
    {
      text: '',
      mode: 'solid',
      colors: ['#FFFFFF'],
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      obfuscated: false,
    },
    overrides
  );
}

// ---------- legacy round-trips ----------

test('legacy: solid segment round-trips exactly', () => {
  const original = [seg({ text: 'Hi', colors: ['#555555'] })];
  const serialized = serializeSegments(original);
  const parsed = parseToSegments(serialized, 'legacy');
  assert.equal(serializeSegments(parsed), serialized);
});

test('legacy: 2-stop gradient round-trips exactly (endpoints are all we can recover, and that\'s all there is)', () => {
  const original = [seg({ text: 'FEMBOY', mode: 'gradient', colors: ['#FF99CC', '#CC66FF'], bold: true })];
  const serialized = serializeSegments(original);
  const parsed = parseToSegments(serialized, 'legacy');
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].mode, 'gradient');
  assert.equal(parsed[0].colors[0], '#FF99CC');
  assert.equal(parsed[0].colors[parsed[0].colors.length - 1], '#CC66FF');
  assert.equal(parsed[0].bold, true);
  assert.equal(serializeSegments(parsed), serialized); // re-serializing the reconstruction matches byte-for-byte
});

test('legacy: adjacent differently-formatted segments round-trip to identical output', () => {
  // "Hi" here is only 2 characters, below the 3-char minimum this module
  // requires before reconstructing a gradient (see deserialize.js) — it's
  // expected to come back as two independent solid characters rather than
  // one gradient segment. What actually matters is that re-serializing
  // still produces byte-identical output either way (each character still
  // gets its exact original color), which is the real correctness bar.
  const original = [
    seg({ text: '[', colors: ['#555555'] }),
    seg({ text: 'Hi', mode: 'gradient', colors: ['#FF0000', '#0000FF'], italic: true }),
    seg({ text: ']', colors: ['#555555'] }),
  ];
  const serialized = serializeSegments(original);
  const parsed = parseToSegments(serialized, 'legacy');
  assert.equal(serializeSegments(parsed), serialized);
});

test('legacy: a real 2-stop gradient next to unrelated solid brackets on both sides reconstructs as one gradient, not merged with either neighbor', () => {
  // This is deliberately adversarial: '[' (555555) and 'Y'->']' (CC66FF
  // then 555555) don't repeat, so a naive "extend through every
  // non-repeating color" heuristic would swallow the brackets into the
  // gradient. The validated-window search must reject those wider
  // candidates and land on exactly 'FEMBOY'.
  const original = [
    seg({ text: '[', colors: ['#555555'] }),
    seg({ text: 'FEMBOY', mode: 'gradient', colors: ['#FF99CC', '#CC66FF'], bold: true }),
    seg({ text: ']', colors: ['#555555'] }),
  ];
  const serialized = serializeSegments(original);
  const parsed = parseToSegments(serialized, 'legacy');
  const gradientSeg = parsed.find((s) => s.mode === 'gradient');
  assert.ok(gradientSeg, 'expected a gradient segment to be reconstructed');
  assert.equal(gradientSeg.text, 'FEMBOY');
  assert.deepEqual(gradientSeg.colors, ['#FF99CC', '#CC66FF']);
  assert.equal(serializeSegments(parsed), serialized);
});

test('legacy: a short 3+-stop gradient degrades to per-character solids (not reconstructed as one gradient) but still round-trips byte-identically', () => {
  // Documented limitation: 2-stop linear interpolation can't reproduce a
  // genuine 3-stop gradient over only 3 characters (see deserialize.js).
  // What matters is that this degrades safely rather than corrupting
  // anything — re-serializing the fallback still matches exactly.
  const original = [
    seg({ text: '[', colors: ['#555555'] }),
    seg({ text: 'RGB', mode: 'gradient', colors: ['#FF0000', '#00FF00', '#0000FF'] }),
    seg({ text: ']', colors: ['#555555'] }),
  ];
  const serialized = serializeSegments(original);
  const parsed = parseToSegments(serialized, 'legacy');
  assert.equal(serializeSegments(parsed), serialized);
});

test('legacy: trailing empty-text color segment round-trips', () => {
  const original = [seg({ text: 'Hi', colors: ['#FF0000'] }), seg({ text: '', colors: ['#00FF00'] })];
  const serialized = serializeSegments(original);
  const parsed = parseToSegments(serialized, 'legacy');
  assert.equal(parsed[parsed.length - 1].text, '');
  assert.equal(serializeSegments(parsed), serialized);
});

test('legacy: real example prefix round-trips exactly', () => {
  const original = [
    seg({ text: '[', colors: ['#555555'] }),
    seg({ text: 'FEMBOY', mode: 'gradient', colors: ['#FF99CC', '#CC66FF'], bold: true }),
    seg({ text: ']', colors: ['#555555'] }),
    seg({ text: ' » ', colors: ['#AAAAAA'] }),
    seg({ text: '', colors: ['#CC66FF'] }),
  ];
  const serialized = serializeSegments(original);
  const parsed = parseToSegments(serialized, 'legacy');
  assert.equal(serializeSegments(parsed), serialized);
});

// ---------- minimessage round-trips (should be lossless, including 3+ stops) ----------

test('minimessage: solid segment round-trips exactly', () => {
  const original = [seg({ text: 'Hi', colors: ['#555555'] })];
  const serialized = serializeMiniMessage(original);
  const parsed = parseToSegments(serialized, 'minimessage');
  assert.equal(serializeMiniMessage(parsed), serialized);
});

test('minimessage: 3-stop gradient round-trips losslessly (all 3 stops preserved)', () => {
  const original = [seg({ text: 'ADVERTISER', mode: 'gradient', colors: ['#FFF700', '#FF8000', '#FF0000'] })];
  const serialized = serializeMiniMessage(original);
  const parsed = parseToSegments(serialized, 'minimessage');
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0].colors, ['#FFF700', '#FF8000', '#FF0000']);
  assert.equal(serializeMiniMessage(parsed), serialized);
});

test('minimessage: format tags round-trip', () => {
  const original = [seg({ text: 'X', colors: ['#FF99CC'], bold: true, italic: true, obfuscated: true })];
  const serialized = serializeMiniMessage(original);
  const parsed = parseToSegments(serialized, 'minimessage');
  assert.equal(parsed[0].bold, true);
  assert.equal(parsed[0].italic, true);
  assert.equal(parsed[0].obfuscated, true);
  assert.equal(parsed[0].underline, false);
  assert.equal(serializeMiniMessage(parsed), serialized);
});

test('minimessage: escaped literal angle brackets round-trip', () => {
  const original = [seg({ text: '<evil>', colors: ['#FFFFFF'] })];
  const serialized = serializeMiniMessage(original);
  const parsed = parseToSegments(serialized, 'minimessage');
  assert.equal(parsed[0].text, '<evil>');
  assert.equal(serializeMiniMessage(parsed), serialized);
});

test('minimessage: multi-segment prefix round-trips exactly', () => {
  const original = [
    seg({ text: '[', colors: ['#555555'] }),
    seg({ text: 'FEMBOY', mode: 'gradient', colors: ['#FF99CC', '#CC66FF'], bold: true }),
    seg({ text: ']', colors: ['#555555'] }),
  ];
  const serialized = serializeMiniMessage(original);
  const parsed = parseToSegments(serialized, 'minimessage');
  assert.equal(serializeMiniMessage(parsed), serialized);
});

console.log(`\n${passed} test(s) passed`);
if (process.exitCode) {
  console.error('SOME TESTS FAILED');
}
