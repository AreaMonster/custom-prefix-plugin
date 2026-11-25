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

function valid(input) {
  return validatePrefixString(input).valid;
}

test('accepts well-formed hex + format codes', () => {
  assert.equal(valid('&#FF99CC&lHi'), true);
});
test('rejects malformed hex', () => {
  assert.equal(valid('&#ZZZZZZ'), false);
});
test('accepts a real legacy color code (b is in 0-9a-f range)', () => {
  assert.equal(valid('A&bB'), true);
});
test('rejects a bare & not followed by a valid code', () => {
  assert.equal(valid('A&'), false);
});
test('empty string is valid (clears the prefix)', () => {
  assert.equal(valid(''), true);
});
test('rejects control characters', () => {
  assert.equal(valid('Hi\nthere'), false);
});
test('rejects input longer than MAX_LENGTH', () => {
  assert.equal(valid('a'.repeat(MAX_LENGTH + 1)), false);
  assert.equal(valid('a'.repeat(MAX_LENGTH)), true);
});
test('rejects non-string input', () => {
  assert.equal(valid(12345), false);
  assert.equal(valid(null), false);
});
test('MiniMessage-style tags are just literal text now, never interpreted', () => {
  // The format was removed; a tag-looking string must not get any special
  // treatment (it's plain characters as far as this validator goes).
  assert.equal(valid('<gradient:#FF0000:#00FF00>Hi</gradient>'), true);
});

console.log(`\n${passed} test(s) passed`);
if (process.exitCode) {
  console.error('SOME TESTS FAILED');
}
