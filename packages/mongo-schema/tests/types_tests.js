// packages/mongo-schema/tests/types_tests.js
import { Tinytest } from 'meteor/tinytest';
import { MongoSchema } from 'meteor/mongo-schema';

Tinytest.add('types - Integer marker exists', function (test) {
  test.isTrue(MongoSchema.Integer !== undefined);
  test.notEqual(MongoSchema.Integer, Number);
});

Tinytest.add('types - Any marker exists', function (test) {
  test.isTrue(MongoSchema.Any !== undefined);
});

Tinytest.add('types - oneOf returns marker', function (test) {
  const union = MongoSchema.oneOf(String, Number);
  test.isTrue(union._isOneOf);
  test.equal(union.types.length, 2);
});

Tinytest.add('types - resolveType identifies String', function (test) {
  const { resolveType } = require('meteor/mongo-schema/types.js');
  const resolved = resolveType(String);
  test.equal(resolved.name, 'string');
  test.equal(resolved.check('hello'), true);
  test.equal(resolved.check(123), false);
});

Tinytest.add('types - resolveType identifies Number', function (test) {
  const { resolveType } = require('meteor/mongo-schema/types.js');
  const resolved = resolveType(Number);
  test.equal(resolved.name, 'number');
  test.equal(resolved.check(42), true);
  test.equal(resolved.check('42'), false);
  test.equal(resolved.check(NaN), false);
});

Tinytest.add('types - resolveType identifies Boolean', function (test) {
  const { resolveType } = require('meteor/mongo-schema/types.js');
  const resolved = resolveType(Boolean);
  test.equal(resolved.name, 'boolean');
  test.equal(resolved.check(true), true);
  test.equal(resolved.check(0), false);
});

Tinytest.add('types - resolveType identifies Date', function (test) {
  const { resolveType } = require('meteor/mongo-schema/types.js');
  const resolved = resolveType(Date);
  test.equal(resolved.name, 'date');
  test.equal(resolved.check(new Date()), true);
  test.equal(resolved.check('2024-01-01'), false);
  test.equal(resolved.check(new Date('invalid')), false);
});

Tinytest.add('types - resolveType identifies Object', function (test) {
  const { resolveType } = require('meteor/mongo-schema/types.js');
  const resolved = resolveType(Object);
  test.equal(resolved.name, 'object');
  test.equal(resolved.check({}), true);
  test.equal(resolved.check([]), false);
  test.equal(resolved.check(null), false);
});

Tinytest.add('types - resolveType identifies Array', function (test) {
  const { resolveType } = require('meteor/mongo-schema/types.js');
  const resolved = resolveType(Array);
  test.equal(resolved.name, 'array');
  test.equal(resolved.check([]), true);
  test.equal(resolved.check({}), false);
});

Tinytest.add('types - resolveType identifies Integer', function (test) {
  const { resolveType } = require('meteor/mongo-schema/types.js');
  const resolved = resolveType(MongoSchema.Integer);
  test.equal(resolved.name, 'integer');
  test.equal(resolved.check(5), true);
  test.equal(resolved.check(5.5), false);
  test.equal(resolved.check('5'), false);
});

Tinytest.add('types - resolveType identifies Any', function (test) {
  const { resolveType } = require('meteor/mongo-schema/types.js');
  const resolved = resolveType(MongoSchema.Any);
  test.equal(resolved.name, 'any');
  test.equal(resolved.check('anything'), true);
  test.equal(resolved.check(null), true);
  test.equal(resolved.check(undefined), true);
});

Tinytest.add('types - resolveType identifies oneOf', function (test) {
  const { resolveType } = require('meteor/mongo-schema/types.js');
  const union = MongoSchema.oneOf(String, Number);
  const resolved = resolveType(union);
  test.equal(resolved.name, 'oneOf');
  test.equal(resolved.check('hello'), true);
  test.equal(resolved.check(42), true);
  test.equal(resolved.check(true), false);
});
