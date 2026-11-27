// packages/mongo-schema/tests/schema_jsonschema_tests.js
import { Tinytest } from 'meteor/tinytest';
import { MongoSchema } from 'meteor/mongo-schema';

Tinytest.add('jsonschema - basic types compile', function (test) {
  const schema = new MongoSchema({
    s: String,
    n: Number,
    b: Boolean,
    d: Date,
  });
  const js = schema.toJsonSchema();
  test.equal(js.bsonType, 'object');
  test.equal(js.properties.s.bsonType, 'string');
  test.isTrue(Array.isArray(js.properties.n.bsonType));
  test.isTrue(js.properties.n.bsonType.includes('double'));
  test.equal(js.properties.b.bsonType, 'bool');
  test.equal(js.properties.d.bsonType, 'date');
});

Tinytest.add('jsonschema - required fields', function (test) {
  const schema = new MongoSchema({
    name: String,
    bio: { type: String, optional: true },
  });
  const js = schema.toJsonSchema();
  test.isTrue(js.required.includes('name'));
  test.isFalse(js.required.includes('bio'));
});

Tinytest.add('jsonschema - _id excluded from required', function (test) {
  const schema = new MongoSchema({
    _id: { type: String },
    name: String,
  });
  const js = schema.toJsonSchema();
  test.isFalse(js.required.includes('_id'));
  test.isTrue(js.properties._id !== undefined);
});

Tinytest.add('jsonschema - allowedValues to enum', function (test) {
  const schema = new MongoSchema({
    status: { type: String, allowedValues: ['a', 'b'] },
  });
  const js = schema.toJsonSchema();
  test.equal(js.properties.status.enum[0], 'a');
  test.equal(js.properties.status.enum[1], 'b');
});

Tinytest.add('jsonschema - min/max number to minimum/maximum', function (test) {
  const schema = new MongoSchema({
    age: { type: Number, min: 0, max: 120 },
  });
  const js = schema.toJsonSchema();
  test.equal(js.properties.age.minimum, 0);
  test.equal(js.properties.age.maximum, 120);
});

Tinytest.add('jsonschema - min/max string to minLength/maxLength', function (test) {
  const schema = new MongoSchema({
    name: { type: String, min: 1, max: 100 },
  });
  const js = schema.toJsonSchema();
  test.equal(js.properties.name.minLength, 1);
  test.equal(js.properties.name.maxLength, 100);
});

Tinytest.add('jsonschema - regEx to pattern', function (test) {
  const schema = new MongoSchema({
    zip: { type: String, regEx: /^\d{5}$/ },
  });
  const js = schema.toJsonSchema();
  test.equal(js.properties.zip.pattern, '^\\d{5}$');
});

Tinytest.add('jsonschema - minCount/maxCount to minItems/maxItems', function (test) {
  const schema = new MongoSchema({
    tags: { type: Array, minCount: 1, maxCount: 5 },
    'tags.$': String,
  });
  const js = schema.toJsonSchema();
  test.equal(js.properties.tags.minItems, 1);
  test.equal(js.properties.tags.maxItems, 5);
  test.equal(js.properties.tags.items.bsonType, 'string');
});

Tinytest.add('jsonschema - nested object compiles', function (test) {
  const schema = new MongoSchema({
    address: { type: Object },
    'address.city': String,
    'address.zip': { type: String, optional: true },
  });
  const js = schema.toJsonSchema();
  test.equal(js.properties.address.bsonType, 'object');
  test.isTrue(js.properties.address.required.includes('city'));
  test.equal(js.properties.address.properties.city.bsonType, 'string');
});

Tinytest.add('jsonschema - Integer compiles to int/long', function (test) {
  const schema = new MongoSchema({ count: { type: MongoSchema.Integer } });
  const js = schema.toJsonSchema();
  test.isTrue(js.properties.count.bsonType.includes('int'));
  test.isTrue(js.properties.count.bsonType.includes('long'));
});

Tinytest.add('jsonschema - exclusiveMin/Max uses Draft 4 booleans', function (test) {
  const schema = new MongoSchema({
    score: { type: Number, min: 0, exclusiveMin: true, max: 100, exclusiveMax: true },
  });
  const js = schema.toJsonSchema();
  test.equal(js.properties.score.minimum, 0);
  test.equal(js.properties.score.exclusiveMinimum, true);
  test.equal(js.properties.score.maximum, 100);
  test.equal(js.properties.score.exclusiveMaximum, true);
});

Tinytest.add('jsonschema - blackbox object omits properties', function (test) {
  const schema = new MongoSchema({
    raw: { type: Object, blackbox: true },
  });
  const js = schema.toJsonSchema();
  test.equal(js.properties.raw.bsonType, 'object');
  test.equal(js.properties.raw.properties, undefined);
});

Tinytest.add('jsonschema - oneOf compiles', function (test) {
  const schema = new MongoSchema({
    val: { type: MongoSchema.oneOf(String, Number) },
  });
  const js = schema.toJsonSchema();
  test.isTrue(Array.isArray(js.properties.val.oneOf));
  test.equal(js.properties.val.oneOf.length, 2);
});
