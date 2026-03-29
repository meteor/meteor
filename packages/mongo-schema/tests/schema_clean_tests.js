// packages/mongo-schema/tests/schema_clean_tests.js
import { Tinytest } from 'meteor/tinytest';
import { MongoSchema } from 'meteor/mongo-schema';

Tinytest.add('clean - filter removes unknown keys', function (test) {
  const schema = new MongoSchema({ name: String, age: Number });
  const result = schema.clean({ name: 'Alice', age: 25, extra: 'nope' });
  test.equal(result.name, 'Alice');
  test.equal(result.age, 25);
  test.equal(result.extra, undefined);
});

Tinytest.add('clean - filter preserves _id even if not in schema', function (test) {
  const schema = new MongoSchema({ name: String });
  const result = schema.clean({ _id: 'abc', name: 'Alice', extra: 'nope' });
  test.equal(result._id, 'abc');
  test.equal(result.name, 'Alice');
  test.equal(result.extra, undefined);
});

Tinytest.add('clean - filter false keeps unknown keys', function (test) {
  const schema = new MongoSchema({ name: String });
  const result = schema.clean({ name: 'Alice', extra: 'kept' }, { filter: false });
  test.equal(result.extra, 'kept');
});

Tinytest.add('clean - trimStrings trims whitespace', function (test) {
  const schema = new MongoSchema({ name: String });
  const result = schema.clean({ name: '  Alice  ' });
  test.equal(result.name, 'Alice');
});

Tinytest.add('clean - trimStrings false preserves whitespace', function (test) {
  const schema = new MongoSchema({ name: String });
  const result = schema.clean({ name: '  Alice  ' }, { trimStrings: false });
  test.equal(result.name, '  Alice  ');
});

Tinytest.add('clean - per-field trim false skips trim', function (test) {
  const schema = new MongoSchema({
    name: { type: String },
    raw: { type: String, trim: false },
  });
  const result = schema.clean({ name: '  Alice  ', raw: '  data  ' });
  test.equal(result.name, 'Alice');
  test.equal(result.raw, '  data  ');
});

Tinytest.add('clean - removeEmptyStrings', function (test) {
  const schema = new MongoSchema({ name: String, bio: { type: String, optional: true } });
  const result = schema.clean({ name: 'Alice', bio: '' });
  test.equal(result.bio, undefined);
});

Tinytest.add('clean - removeEmptyStrings false keeps them', function (test) {
  const schema = new MongoSchema({ name: String, bio: { type: String, optional: true } });
  const result = schema.clean({ name: 'Alice', bio: '' }, { removeEmptyStrings: false });
  test.equal(result.bio, '');
});

Tinytest.add('clean - removeNullsFromArrays', function (test) {
  const schema = new MongoSchema({
    tags: { type: Array },
    'tags.$': String,
  });
  const result = schema.clean({ tags: ['a', null, 'b', null] }, { removeNullsFromArrays: true });
  test.equal(result.tags.length, 2);
  test.equal(result.tags[0], 'a');
  test.equal(result.tags[1], 'b');
});

Tinytest.add('clean - removeNullsFromArrays false keeps nulls', function (test) {
  const schema = new MongoSchema({
    tags: { type: Array },
    'tags.$': String,
  });
  const result = schema.clean({ tags: ['a', null, 'b'] }, { removeNullsFromArrays: false });
  test.equal(result.tags.length, 3);
});

Tinytest.add('clean - nested defaultValue applied', function (test) {
  const schema = new MongoSchema({
    address: { type: Object },
    'address.country': { type: String, defaultValue: 'US' },
    'address.city': String,
  });
  const result = schema.clean({ address: { city: 'NYC' } });
  test.equal(result.address.country, 'US');
});

Tinytest.add('clean - nested autoValue runs', function (test) {
  const schema = new MongoSchema({
    address: { type: Object },
    'address.normalized': {
      type: Boolean,
      autoValue() { return true; },
    },
  });
  const result = schema.clean({ address: {} });
  test.equal(result.address.normalized, true);
});

Tinytest.add('clean - mutate false returns clone', function (test) {
  const schema = new MongoSchema({ name: String });
  const original = { name: '  Alice  ' };
  const result = schema.clean(original, { mutate: false });
  test.equal(result.name, 'Alice');
  test.equal(original.name, '  Alice  ');
  test.notEqual(result, original);
});

Tinytest.add('clean - mutate true modifies in place', function (test) {
  const schema = new MongoSchema({ name: String });
  const original = { name: '  Alice  ' };
  const result = schema.clean(original, { mutate: true });
  test.equal(original.name, 'Alice');
  test.equal(result, original);
});

Tinytest.add('clean - autoConvert string to number', function (test) {
  const schema = new MongoSchema({ age: Number });
  const result = schema.clean({ age: '25' });
  test.equal(result.age, 25);
});

Tinytest.add('clean - autoConvert string to boolean', function (test) {
  const schema = new MongoSchema({ active: Boolean });
  test.equal(schema.clean({ active: 'true' }).active, true);
  test.equal(schema.clean({ active: 'false' }).active, false);
});

Tinytest.add('clean - autoConvert string to date', function (test) {
  const schema = new MongoSchema({ d: Date });
  const result = schema.clean({ d: '2024-01-15T00:00:00Z' });
  test.instanceOf(result.d, Date);
});

Tinytest.add('clean - autoConvert number to string', function (test) {
  const schema = new MongoSchema({ code: String });
  test.equal(schema.clean({ code: 42 }).code, '42');
});

Tinytest.add('clean - defaultValue applied when missing', function (test) {
  const schema = new MongoSchema({
    active: { type: Boolean, defaultValue: false },
    name: String,
  });
  const result = schema.clean({ name: 'Alice' });
  test.equal(result.active, false);
});

Tinytest.add('clean - defaultValue not applied when present', function (test) {
  const schema = new MongoSchema({
    active: { type: Boolean, defaultValue: false },
  });
  const result = schema.clean({ active: true });
  test.equal(result.active, true);
});

Tinytest.add('clean - autoValue runs with context', function (test) {
  const schema = new MongoSchema({
    createdAt: {
      type: Date,
      autoValue() {
        if (!this.isSet) return new Date('2024-01-01');
      },
    },
  });
  const result = schema.clean({});
  test.equal(result.createdAt.getFullYear(), 2024);
});

Tinytest.add('clean - autoValue with extendAutoValueContext', function (test) {
  const schema = new MongoSchema({
    createdBy: {
      type: String,
      autoValue() {
        if (this.isInsert) return this.userId;
      },
    },
  });
  const result = schema.clean({}, {
    extendAutoValueContext: {
      isInsert: true,
      isUpdate: false,
      isUpsert: false,
      userId: 'user123',
    },
  });
  test.equal(result.createdBy, 'user123');
});

Tinytest.add('clean - autoValue unset removes field', function (test) {
  const schema = new MongoSchema({
    secret: {
      type: String,
      autoValue() {
        if (!this.isFromTrustedCode) this.unset();
      },
    },
  });
  const result = schema.clean({ secret: 'hack' }, {
    extendAutoValueContext: { isFromTrustedCode: false },
  });
  test.equal(result.secret, undefined);
});

Tinytest.add('clean - removeEmptyStrings recurses into nested objects', function (test) {
  const schema = new MongoSchema({
    address: { type: Object },
    'address.city': { type: String, optional: true },
    'address.zip': { type: String, optional: true },
    name: String,
  });
  const result = schema.clean({
    name: 'Alice',
    address: { city: '', zip: '12345' },
  });
  test.equal(result.address.city, undefined);
  test.equal(result.address.zip, '12345');
});

Tinytest.add('clean - removeEmptyStrings recurses deeply', function (test) {
  const schema = new MongoSchema({
    level1: { type: Object },
    'level1.level2': { type: Object },
    'level1.level2.value': { type: String, optional: true },
    'level1.level2.other': { type: String, optional: true },
  });
  const result = schema.clean({
    level1: { level2: { value: '', other: 'kept' } },
  });
  test.equal(result.level1.level2.value, undefined);
  test.equal(result.level1.level2.other, 'kept');
});

Tinytest.add('clean - modifier mode cleans $set fields', function (test) {
  const schema = new MongoSchema({ name: String, age: Number });
  const result = schema.clean(
    { $set: { name: '  Alice  ', age: '25' } },
    { isModifier: true }
  );
  test.equal(result.$set.name, 'Alice');
  test.equal(result.$set.age, 25);
});
