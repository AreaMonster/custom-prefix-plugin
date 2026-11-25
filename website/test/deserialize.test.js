'use strict';

// Run with: npm test

const assert = require('node:assert/strict');
const { serializeSegments } = require('../public/serialize.js');
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

// ---------- round-trips of this tool's own output ----------

test('solid segment round-trips exactly', () => {
  const original = [seg({ text: 'Hi', colors: ['#555555'] })];
  const serialized = serializeSegments(original);
  const parsed = parseToSegments(serialized);
  assert.equal(serializeSegments(parsed), serialized);
});

test('2-stop gradient round-trips exactly (endpoints are all we can recover, and that\'s all there is)', () => {
  const original = [seg({ text: 'FEMBOY', mode: 'gradient', colors: ['#FF99CC', '#CC66FF'], bold: true })];
  const serialized = serializeSegments(original);
  const parsed = parseToSegments(serialized);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].mode, 'gradient');
  assert.equal(parsed[0].colors[0], '#FF99CC');
  assert.equal(parsed[0].colors[parsed[0].colors.length - 1], '#CC66FF');
  assert.equal(parsed[0].bold, true);
  assert.equal(serializeSegments(parsed), serialized); // re-serializing the reconstruction matches byte-for-byte
});

test('adjacent differently-formatted segments round-trip to identical output', () => {
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
  const parsed = parseToSegments(serialized);
  assert.equal(serializeSegments(parsed), serialized);
});

test('a real 2-stop gradient next to unrelated solid brackets on both sides reconstructs as one gradient, not merged with either neighbor', () => {
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
  const parsed = parseToSegments(serialized);
  const gradientSeg = parsed.find((s) => s.mode === 'gradient');
  assert.ok(gradientSeg, 'expected a gradient segment to be reconstructed');
  assert.equal(gradientSeg.text, 'FEMBOY');
  assert.deepEqual(gradientSeg.colors, ['#FF99CC', '#CC66FF']);
  assert.equal(serializeSegments(parsed), serialized);
});

test('a short 3+-stop gradient degrades to per-character solids (not reconstructed as one gradient) but still round-trips byte-identically', () => {
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
  const parsed = parseToSegments(serialized);
  assert.equal(serializeSegments(parsed), serialized);
});

test('trailing empty-text color segment round-trips', () => {
  const original = [seg({ text: 'Hi', colors: ['#FF0000'] }), seg({ text: '', colors: ['#00FF00'] })];
  const serialized = serializeSegments(original);
  const parsed = parseToSegments(serialized);
  assert.equal(parsed[parsed.length - 1].text, '');
  assert.equal(serializeSegments(parsed), serialized);
});

test('real example prefix round-trips exactly', () => {
  const original = [
    seg({ text: '[', colors: ['#555555'] }),
    seg({ text: 'FEMBOY', mode: 'gradient', colors: ['#FF99CC', '#CC66FF'], bold: true }),
    seg({ text: ']', colors: ['#555555'] }),
    seg({ text: ' » ', colors: ['#AAAAAA'] }),
    seg({ text: '', colors: ['#CC66FF'] }),
  ];
  const serialized = serializeSegments(original);
  const parsed = parseToSegments(serialized);
  assert.equal(serializeSegments(parsed), serialized);
});

// ---------- ordinary rank prefixes (what "start from my rank prefix" loads) ----------

test('classic color codes map to their real colors', () => {
  const parsed = parseToSegments('&8[&cOwner&8]');
  assert.deepEqual(parsed.map((s) => s.text), ['[', 'Owner', ']']);
  assert.deepEqual(parsed.map((s) => s.colors[0]), ['#555555', '#FF5555', '#555555']);
});

test('a color code resets formatting set before it, like Minecraft does', () => {
  // Bold set AFTER the color applies; the next color code wipes it.
  const after = parseToSegments('&c&lA&bB');
  assert.equal(after[0].text, 'A');
  assert.equal(after[0].bold, true);
  assert.equal(after[1].text, 'B');
  assert.equal(after[1].bold, false);

  // Bold set BEFORE a color code is wiped by that color code.
  const before = parseToSegments('&l&cA');
  assert.equal(before[0].bold, false);
});

test('format codes persist across characters until a color code or &r', () => {
  const parsed = parseToSegments('&c&lAB&rC');
  assert.equal(parsed[0].text, 'AB');
  assert.equal(parsed[0].bold, true);
  assert.equal(parsed[1].text, 'C');
  assert.equal(parsed[1].bold, false);
  assert.equal(parsed[1].colors[0], '#FFFFFF');
});

test('BungeeCord-style &x&R&R&G&G&B&B hex is understood', () => {
  const parsed = parseToSegments('&x&f&f&0&0&8&0Hi');
  assert.equal(parsed[0].text, 'Hi');
  assert.equal(parsed[0].colors[0], '#FF0080');
});

test('hex and classic codes can be mixed in one prefix', () => {
  const parsed = parseToSegments('&#26FDC7VIP &7»');
  assert.equal(parsed[0].colors[0], '#26FDC7');
  assert.equal(parsed[parsed.length - 1].text, '»');
  assert.equal(parsed[parsed.length - 1].colors[0], '#AAAAAA');
});

test('a lone & that is not a code is dropped rather than eating the next character', () => {
  const parsed = parseToSegments('&cA&!B');
  assert.deepEqual(parsed.map((s) => s.text).join(''), 'A!B');
});

test('empty input gives no segments', () => {
  assert.deepEqual(parseToSegments(''), []);
});

console.log(`\n${passed} test(s) passed`);
if (process.exitCode) {
  console.error('SOME TESTS FAILED');
}
