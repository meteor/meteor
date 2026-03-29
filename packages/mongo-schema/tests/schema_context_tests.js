// packages/mongo-schema/tests/schema_context_tests.js
import { Tinytest } from 'meteor/tinytest';
import { MongoSchema } from 'meteor/mongo-schema';

Tinytest.add('context - newContext returns context', function (test) {
  const schema = new MongoSchema({ name: String });
  const ctx = schema.newContext();
  test.isTrue(ctx !== undefined);
  test.equal(typeof ctx.validate, 'function');
});

Tinytest.add('context - validate returns boolean', function (test) {
  const schema = new MongoSchema({ name: String });
  const ctx = schema.newContext();
  test.isTrue(ctx.validate({ name: 'Alice' }));
  test.isFalse(ctx.validate({}));
});

Tinytest.add('context - isValid reflects last validation', function (test) {
  const schema = new MongoSchema({ name: String });
  const ctx = schema.newContext();
  ctx.validate({ name: 'Alice' });
  test.isTrue(ctx.isValid());
  ctx.validate({});
  test.isFalse(ctx.isValid());
});

Tinytest.add('context - validationErrors returns error array', function (test) {
  const schema = new MongoSchema({ name: String, age: Number });
  const ctx = schema.newContext();
  ctx.validate({});
  const errors = ctx.validationErrors();
  test.equal(errors.length, 2);
});

Tinytest.add('context - keyIsInvalid checks specific field', function (test) {
  const schema = new MongoSchema({ name: String, age: { type: Number, optional: true } });
  const ctx = schema.newContext();
  ctx.validate({});
  test.isTrue(ctx.keyIsInvalid('name'));
  test.isFalse(ctx.keyIsInvalid('age'));
});

Tinytest.add('context - keyErrorMessage returns message', function (test) {
  const schema = new MongoSchema({ name: String });
  const ctx = schema.newContext();
  ctx.validate({});
  const msg = ctx.keyErrorMessage('name');
  test.isTrue(msg.length > 0);
});

Tinytest.add('context - namedContext returns same instance', function (test) {
  const schema = new MongoSchema({ name: String });
  const ctx1 = schema.namedContext('form');
  const ctx2 = schema.namedContext('form');
  test.equal(ctx1, ctx2);
});

Tinytest.add('context - runs instance validators via addValidator', function (test) {
  const schema = new MongoSchema({ name: String, age: { type: Number, optional: true } });
  schema.addValidator(function () {
    if (this.key === 'name' && this.value === 'forbidden') {
      return 'forbiddenName';
    }
  });
  const ctx = schema.newContext();
  test.isTrue(ctx.validate({ name: 'Alice' }));
  test.isFalse(ctx.validate({ name: 'forbidden' }));
  test.isTrue(ctx.validationErrors().some(e => e.type === 'forbiddenName'));
});

Tinytest.add('context - runs doc validators via addDocValidator', function (test) {
  const schema = new MongoSchema({ a: Number, b: Number });
  schema.addDocValidator(function (doc) {
    if (doc.a > doc.b) {
      return [{ name: 'a', type: 'aMustNotExceedB', value: doc.a, message: 'a must not exceed b' }];
    }
    return [];
  });
  const ctx = schema.newContext();
  test.isTrue(ctx.validate({ a: 1, b: 2 }));
  test.isFalse(ctx.validate({ a: 5, b: 3 }));
  test.isTrue(ctx.validationErrors().some(e => e.type === 'aMustNotExceedB'));
});

Tinytest.add('context - namedContext different names are different', function (test) {
  const schema = new MongoSchema({ name: String });
  const ctx1 = schema.namedContext('form1');
  const ctx2 = schema.namedContext('form2');
  test.notEqual(ctx1, ctx2);
});

Tinytest.add('context - namedContext with prototype-collision name works', function (test) {
  const schema = new MongoSchema({ name: String });
  const ctx = schema.namedContext('constructor');
  test.isTrue(ctx !== undefined);
  test.equal(typeof ctx.validate, 'function');
  const ctx2 = schema.namedContext('constructor');
  test.equal(ctx, ctx2);
});

Tinytest.add('context - namedContext toString key works', function (test) {
  const schema = new MongoSchema({ name: String });
  const ctx = schema.namedContext('toString');
  test.isTrue(ctx !== undefined);
  test.equal(typeof ctx.validate, 'function');
});
