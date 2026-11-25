'use strict';

// Tiny dependency-free test runner for the pure functions in public/.
// Run with: npm test

const assert = require('node:assert/strict');
const { gradientColors } = require('../public/color.js');
const { serializeSegments } = require('../public/serialize.js');

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

// ---------- color.js ----------

test('gradientColors (2 stops) interpolates endpoints exactly and linearly in between', () => {
  const colors = gradientColors(['#FF0000', '#0000FF'], 3);
  assert.deepEqual(colors, ['#FF0000', '#800080', '#0000FF']);
});

test('gradientColors (3 stops) hits every stop exactly at its position', () => {
  // 5 samples across 3 stops: positions 0, 0.25, 0.5, 0.75, 1 -> stop
  // boundaries land exactly on samples 0, 2, 4.
  const colors = gradientColors(['#FF0000', '#00FF00', '#0000FF'], 5);
  assert.equal(colors[0], '#FF0000');
  assert.equal(colors[2], '#00FF00');
  assert.equal(colors[4], '#0000FF');
});

test('gradientColors with a single stop repeats that color', () => {
  assert.deepEqual(gradientColors(['#FF0000'], 3), ['#FF0000', '#FF0000', '#FF0000']);
});

test('gradientColors with count=1 samples the first position', () => {
  assert.deepEqual(gradientColors(['#FF0000', '#00FF00'], 1), ['#FF0000']);
});

// ---------- serializeSegments ----------

test('solid segment re-emits the color code before every character', () => {
  const out = serializeSegments([seg({ text: 'AB', colors: ['#555555'] })]);
  assert.equal(out, '&#555555A&#555555B');
});

test('gradient segment interpolates per character', () => {
  const out = serializeSegments([
    seg({ text: 'AB', mode: 'gradient', colors: ['#FF0000', '#0000FF'] }),
  ]);
  assert.equal(out, '&#FF0000A&#0000FFB');
});

test('multi-stop gradient segment follows every stop', () => {
  const out = serializeSegments([
    seg({ text: 'ABC', mode: 'gradient', colors: ['#FF0000', '#00FF00', '#0000FF'] }),
  ]);
  assert.equal(out, '&#FF0000A&#00FF00B&#0000FFC');
});

test('format codes are emitted in the fixed stable order after the color code', () => {
  const out = serializeSegments([
    seg({
      text: 'X',
      colors: ['#FF99CC'],
      bold: true, italic: true, underline: true, strikethrough: true, obfuscated: true,
    }),
  ]);
  assert.equal(out, '&#FF99CC&l&o&n&m&kX');
});

test('empty-text segment emits a trailing color code with no character', () => {
  const out = serializeSegments([seg({ text: '', colors: ['#CC66FF'] })]);
  assert.equal(out, '&#CC66FF');
});

console.log(`\n${passed} test(s) passed`);
if (process.exitCode) {
  console.error('SOME TESTS FAILED');
}
