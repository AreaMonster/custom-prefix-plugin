'use strict';

// Run with: npm test

const assert = require('node:assert/strict');
const { validatePrefixString, MAX_LENGTH } = require('../src/validate/prefixString.js');

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

function valid(input, format) {
  return validatePrefixString(input, format).valid;
}

// ---------- legacy ----------

test('legacy: accepts well-formed hex + format codes', () => {
  assert.equal(valid('&#FF99CC&lHi', 'legacy'), true);
});
test('legacy: rejects malformed hex', () => {
  assert.equal(valid('&#ZZZZZZ', 'legacy'), false);
});
test('legacy: accepts a real legacy color code (b is in 0-9a-f range)', () => {
  assert.equal(valid('A&bB', 'legacy'), true);
});
test('legacy: rejects a bare & not followed by a valid code', () => {
  assert.equal(valid('A&', 'legacy'), false);
});
test('legacy: empty string is valid (clears the prefix)', () => {
  assert.equal(valid('', 'legacy'), true);
});
test('legacy: rejects control characters', () => {
  assert.equal(valid('Hi\nthere', 'legacy'), false);
});

// ---------- minimessage: allowed ----------

test('minimessage: gradient tag with hex stops', () => {
  assert.equal(valid('<gradient:#FF0000:#00FF00>Hi</gradient>', 'minimessage'), true);
});
test('minimessage: <#RRGGBB> shorthand color tag, open and close', () => {
  assert.equal(valid('<#FF0000>Hi</#FF0000>', 'minimessage'), true);
});
test('minimessage: format tags (bold/italic/etc)', () => {
  assert.equal(valid('<bold><italic>Hi</italic></bold>', 'minimessage'), true);
});
test('minimessage: escaped literal angle brackets in text', () => {
  assert.equal(valid('<#FF0000>\\<Hi\\></#FF0000>', 'minimessage'), true);
});
test('minimessage: tags do not need to balance (allowlist only, not a grammar check)', () => {
  assert.equal(valid('<bold>Hi', 'minimessage'), true);
});

// ---------- minimessage: rejected (this is the actual security boundary) ----------

test('minimessage: rejects <click> (would let a player fake a clickable command)', () => {
  assert.equal(valid('<click:run_command:/op hacker>Hi</click>', 'minimessage'), false);
});
test('minimessage: rejects <hover>', () => {
  assert.equal(valid('<hover:show_text:evil>Hi</hover>', 'minimessage'), false);
});
test('minimessage: rejects <insert>', () => {
  assert.equal(valid('<insert:malicious>Hi</insert>', 'minimessage'), false);
});
test('minimessage: rejects <nbt>', () => {
  assert.equal(valid('<nbt:block:1:2:3:Items>Hi</nbt>', 'minimessage'), false);
});
test('minimessage: rejects a gradient stop that is not valid hex', () => {
  assert.equal(valid('<gradient:not-a-color>Hi</gradient>', 'minimessage'), false);
});
test('minimessage: rejects a truly unterminated tag (no closing >)', () => {
  assert.equal(valid('<bold', 'minimessage'), false);
});
test('minimessage: rejects a stray unescaped >', () => {
  assert.equal(valid('Hi>there', 'minimessage'), false);
});

// ---------- shared ----------

test('rejects input longer than MAX_LENGTH', () => {
  assert.equal(valid('a'.repeat(MAX_LENGTH + 1), 'legacy'), false);
  assert.equal(valid('a'.repeat(MAX_LENGTH), 'legacy'), true);
});
test('rejects non-string input', () => {
  assert.equal(valid(12345, 'legacy'), false);
  assert.equal(valid(null, 'legacy'), false);
});

console.log(`\n${passed} test(s) passed`);
if (process.exitCode) {
  console.error('SOME TESTS FAILED');
}
