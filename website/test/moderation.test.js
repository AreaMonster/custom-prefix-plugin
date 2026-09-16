'use strict';

// Run with: npm test

const assert = require('node:assert/strict');
const { extractVisibleText } = require('../src/textExtract.js');
const { checkText } = require('../src/moderation.js');

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

// ---------- textExtract ----------

test('extractVisibleText (legacy) strips color codes and format codes', () => {
  assert.equal(extractVisibleText('&#FF99CC&lF&#CC66FFE', 'legacy'), 'FE');
});
test('extractVisibleText (legacy) handles a trailing color-only code', () => {
  assert.equal(extractVisibleText('&#555555[&#CC66FFHi&#555555]&#CC66FF', 'legacy'), '[Hi]');
});
test('extractVisibleText (minimessage) strips tags but keeps text', () => {
  assert.equal(
    extractVisibleText('<gradient:#FF0000:#00FF00><bold>Hi</bold></gradient>', 'minimessage'),
    'Hi'
  );
});
test('extractVisibleText (minimessage) unescapes literal angle brackets', () => {
  assert.equal(extractVisibleText('<#FFFFFF>\\<evil\\></#FFFFFF>', 'minimessage'), '<evil>');
});

// ---------- moderation: staff impersonation (built-in defaults) ----------

test('blocks a plain staff-role word', () => {
  assert.equal(checkText('Owner').blocked, true);
});
test('blocks a staff-role word disguised with spacing/punctuation', () => {
  assert.equal(checkText('A d m i n').blocked, true);
  assert.equal(checkText('Ad-min').blocked, true);
});
test('blocks a staff-role word disguised with leetspeak', () => {
  assert.equal(checkText('0wner').blocked, true);
  assert.equal(checkText('4dm1n').blocked, true);
});
test('blocks a staff-role word embedded inside other text', () => {
  assert.equal(checkText('xXOwnerXx').blocked, true);
});

// ---------- moderation: ordinary text is unaffected ----------

test('allows ordinary player-chosen text', () => {
  assert.equal(checkText('FEMBOY').blocked, false);
  assert.equal(checkText('Dragonborn').blocked, false);
  assert.equal(checkText('xX_Shadow_Xx').blocked, false);
});
test('allows empty text (clearing a prefix)', () => {
  assert.equal(checkText('').blocked, false);
});
test('allows decorative-only text with no letters', () => {
  assert.equal(checkText('»»»').blocked, false);
});

console.log(`\n${passed} test(s) passed`);
if (process.exitCode) {
  console.error('SOME TESTS FAILED');
}
