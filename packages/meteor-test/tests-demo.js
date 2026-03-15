// Demo: testing Meteor core packages with node:test
//
// Run with:
//   meteor test-packages meteor-test --driver-package meteor-test --once

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { check, Match } from 'meteor/check';
import { Random } from 'meteor/random';
import { EJSON } from 'meteor/ejson';

describe('check', () => {
  it('validates String pattern', () => {
    check('hello', String);
    assert.throws(() => check(123, String), Match.Error);
  });

  it('validates Number pattern', () => {
    check(42, Number);
    check(0, Number);
    assert.throws(() => check('nope', Number), Match.Error);
  });

  it('validates Boolean pattern', () => {
    check(true, Boolean);
    check(false, Boolean);
    assert.throws(() => check(1, Boolean), Match.Error);
  });

  it('validates Object pattern', () => {
    check({ name: 'test', age: 25 }, { name: String, age: Number });
    assert.throws(
      () => check({ name: 'test', age: 'old' }, { name: String, age: Number }),
      Match.Error,
    );
  });

  it('supports Match.Maybe', () => {
    check(undefined, Match.Maybe(String));
    check(null, Match.Maybe(String));
    check('hello', Match.Maybe(String));
    assert.throws(() => check(42, Match.Maybe(String)), Match.Error);
  });

  it('supports Match.OneOf', () => {
    check('a', Match.OneOf(String, Number));
    check(1, Match.OneOf(String, Number));
    assert.throws(() => check(true, Match.OneOf(String, Number)), Match.Error);
  });

  it('supports Match.Where', () => {
    const positiveNumber = Match.Where(x => {
      check(x, Number);
      return x > 0;
    });
    check(5, positiveNumber);
    assert.throws(() => check(-1, positiveNumber), Match.Error);
  });

  it('supports [Pattern] for arrays', () => {
    check([1, 2, 3], [Number]);
    check([], [String]);
    assert.throws(() => check([1, 'two'], [Number]), Match.Error);
  });

  it('Match.test returns boolean without throwing', () => {
    assert.equal(Match.test('hello', String), true);
    assert.equal(Match.test(123, String), false);
    assert.equal(Match.test({ x: 1 }, { x: Number }), true);
  });
});

describe('Random', () => {
  it('generates unique ids', () => {
    const a = Random.id();
    const b = Random.id();
    assert.notEqual(a, b);
    assert.equal(typeof a, 'string');
  });

  it('generates ids of specified length', () => {
    assert.equal(Random.id(5).length, 5);
    assert.equal(Random.id(20).length, 20);
  });

  it('generates hex strings', () => {
    const hex = Random.hexString(16);
    assert.equal(hex.length, 16);
    assert.match(hex, /^[0-9a-f]+$/);
  });

  it('returns random choice from array', () => {
    const arr = [1, 2, 3, 4, 5];
    const choice = Random.choice(arr);
    assert.ok(arr.includes(choice));
  });

  it('generates secret tokens', () => {
    const secret = Random.secret();
    assert.equal(typeof secret, 'string');
    assert.ok(secret.length > 0);
  });
});

describe('EJSON', () => {
  it('stringifies and parses dates', () => {
    const date = new Date('2024-01-01T00:00:00Z');
    const str = EJSON.stringify(date);
    const parsed = EJSON.parse(str);
    assert.deepEqual(parsed, date);
  });

  it('handles nested objects', () => {
    const obj = { a: 1, b: { c: [1, 2, 3] } };
    const clone = EJSON.clone(obj);
    assert.deepEqual(clone, obj);
    assert.notEqual(clone, obj);
    assert.notEqual(clone.b, obj.b);
  });

  it('compares with EJSON.equals', () => {
    assert.ok(EJSON.equals({ a: 1 }, { a: 1 }));
    assert.ok(!EJSON.equals({ a: 1 }, { a: 2 }));
    assert.ok(EJSON.equals(new Date(1000), new Date(1000)));
  });
});
