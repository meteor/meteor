// packages/mongo-schema/tests/schema_definition_tests.js
import { Tinytest } from 'meteor/tinytest';
import { MongoSchema } from 'meteor/mongo-schema';

// --- Basic parsing tests ---

Tinytest.add('definition - shorthand bare constructor', function (test) {
  const schema = new MongoSchema({ name: String });
  test.isTrue(schema._ir.has('name'));
  test.equal(schema._ir.get('name').resolvedType.name, 'string');
});

Tinytest.add('definition - full form object', function (test) {
  const schema = new MongoSchema({ name: { type: String, max: 100 } });
  const desc = schema._ir.get('name');
  test.equal(desc.resolvedType.name, 'string');
  test.equal(desc.max, 100);
});

Tinytest.add('definition - required by default', function (test) {
  const schema = new MongoSchema({ name: String, age: Number });
  test.equal(schema._ir.get('name').required, true);
  test.equal(schema._ir.get('age').required, true);
});

Tinytest.add('definition - optional flag', function (test) {
  const schema = new MongoSchema({ name: { type: String, optional: true } });
  test.equal(schema._ir.get('name').required, false);
});

Tinytest.add('definition - required flag explicit', function (test) {
  const schema = new MongoSchema(
    { name: { type: String, required: false } },
    { requiredByDefault: true }
  );
  test.equal(schema._ir.get('name').required, false);
});

Tinytest.add('definition - auto label from key', function (test) {
  const schema = new MongoSchema({ createdAt: Date });
  test.equal(schema._ir.get('createdAt').label, 'Created At');
});

Tinytest.add('definition - RegExp shorthand', function (test) {
  const schema = new MongoSchema({ phone: /^\d{10}$/ });
  const desc = schema._ir.get('phone');
  test.equal(desc.resolvedType.name, 'string');
  test.instanceOf(desc.regEx, RegExp);
});

Tinytest.add('definition - array shorthand expands to two fields', function (test) {
  const schema = new MongoSchema({ tags: [String] });
  test.isTrue(schema._ir.has('tags'));
  test.isTrue(schema._ir.has('tags.$'));
  test.equal(schema._ir.get('tags').resolvedType.name, 'array');
  test.equal(schema._ir.get('tags.$').resolvedType.name, 'string');
});

Tinytest.add('definition - allowedValues Set converted to Array', function (test) {
  const schema = new MongoSchema({
    status: { type: String, allowedValues: new Set(['active', 'inactive']) },
  });
  const desc = schema._ir.get('status');
  test.isTrue(Array.isArray(desc.allowedValues));
  test.isTrue(desc.allowedValues.includes('active'));
  test.isTrue(desc.allowedValues.includes('inactive'));
});

// --- Task 5 tests: dot notation, nested, oneOf ---

Tinytest.add('definition - dot notation nested object', function (test) {
  const schema = new MongoSchema({
    address: { type: Object },
    'address.street': { type: String },
    'address.city': { type: String },
    'address.zip': { type: String, optional: true },
  });
  test.isTrue(schema._ir.has('address'));
  test.isTrue(schema._ir.has('address.street'));
  test.isTrue(schema._ir.has('address.city'));
  test.isTrue(schema._ir.has('address.zip'));
  const addr = schema._ir.get('address');
  test.isTrue(addr.children.includes('address.street'));
  test.isTrue(addr.children.includes('address.city'));
  test.isTrue(addr.children.includes('address.zip'));
  test.equal(addr.children.length, 3);
});

Tinytest.add('definition - array of objects', function (test) {
  const schema = new MongoSchema({
    contacts: { type: Array },
    'contacts.$': { type: Object },
    'contacts.$.name': { type: String },
    'contacts.$.email': { type: String, optional: true },
  });
  const contacts = schema._ir.get('contacts');
  test.equal(contacts.resolvedType.name, 'array');
  test.equal(contacts.itemKey, 'contacts.$');
  const item = schema._ir.get('contacts.$');
  test.equal(item.resolvedType.name, 'object');
  test.isTrue(item.children.includes('contacts.$.name'));
  test.isTrue(item.children.includes('contacts.$.email'));
});

Tinytest.add('definition - oneOf type', function (test) {
  const schema = new MongoSchema({
    value: { type: MongoSchema.oneOf(String, Number) },
  });
  test.equal(schema._ir.get('value').resolvedType.name, 'oneOf');
});

Tinytest.add('definition - inline subschema', function (test) {
  const sub = new MongoSchema({ key: String, val: String });
  const schema = new MongoSchema({
    metadata: { type: sub },
  });
  test.equal(schema._ir.get('metadata').resolvedType.name, 'schema');
});

Tinytest.add('definition - blackbox object skips children', function (test) {
  const schema = new MongoSchema({
    raw: { type: Object, blackbox: true },
  });
  const raw = schema._ir.get('raw');
  test.equal(raw.blackbox, true);
  test.equal(raw.children.length, 0);
});

Tinytest.add('definition - _id field never required', function (test) {
  const schema = new MongoSchema({
    _id: { type: String },
    name: { type: String },
  });
  test.equal(schema._ir.get('_id').required, false);
  test.equal(schema._ir.get('name').required, true);
});

// --- Task 6 tests: composition ---

Tinytest.add('composition - extend merges schemas', function (test) {
  const s1 = new MongoSchema({ name: String });
  const s2 = new MongoSchema({ age: Number });
  const merged = s1.extend(s2);
  test.isTrue(merged._ir.has('name'));
  test.isTrue(merged._ir.has('age'));
});

Tinytest.add('composition - extend latter wins on conflict', function (test) {
  const s1 = new MongoSchema({ name: { type: String, max: 50 } });
  const s2 = new MongoSchema({ name: { type: String, max: 100 } });
  const merged = s1.extend(s2);
  test.equal(merged._ir.get('name').max, 100);
});

Tinytest.add('composition - pick creates subset', function (test) {
  const schema = new MongoSchema({ name: String, age: Number, email: String });
  const picked = schema.pick('name', 'email');
  test.isTrue(picked._ir.has('name'));
  test.isTrue(picked._ir.has('email'));
  test.isFalse(picked._ir.has('age'));
});

Tinytest.add('composition - omit excludes fields', function (test) {
  const schema = new MongoSchema({ name: String, age: Number, email: String });
  const omitted = schema.omit('age');
  test.isTrue(omitted._ir.has('name'));
  test.isTrue(omitted._ir.has('email'));
  test.isFalse(omitted._ir.has('age'));
});

Tinytest.add('composition - pick includes nested children', function (test) {
  const schema = new MongoSchema({
    address: { type: Object },
    'address.city': String,
    'address.zip': String,
    name: String,
  });
  const picked = schema.pick('address');
  test.isTrue(picked._ir.has('address'));
  test.isTrue(picked._ir.has('address.city'));
  test.isTrue(picked._ir.has('address.zip'));
  test.isFalse(picked._ir.has('name'));
});

Tinytest.add('composition - getObjectSchema extracts subschema', function (test) {
  const schema = new MongoSchema({
    address: { type: Object },
    'address.city': String,
    'address.zip': { type: String, optional: true },
    name: String,
  });
  const sub = schema.getObjectSchema('address');
  test.isTrue(sub._ir.has('city'));
  test.isTrue(sub._ir.has('zip'));
  test.isFalse(sub._ir.has('name'));
  test.isFalse(sub._ir.has('address'));
});

// --- Task 16 tests: accessor methods ---

Tinytest.add('schema - schema() returns raw definition', function (test) {
  const def = { name: { type: String } };
  const schema = new MongoSchema(def);
  const returned = schema.schema();
  test.equal(returned.name.type, String);
});

Tinytest.add('schema - schema(key) returns field def', function (test) {
  const schema = new MongoSchema({ name: { type: String, max: 50 } });
  const fieldDef = schema.schema('name');
  test.equal(fieldDef.type, String);
  test.equal(fieldDef.max, 50);
});

Tinytest.add('schema - label returns field label', function (test) {
  const schema = new MongoSchema({ firstName: { type: String, label: 'First Name' } });
  test.equal(schema.label('firstName'), 'First Name');
});

Tinytest.add('schema - defaultValue returns default', function (test) {
  const schema = new MongoSchema({ active: { type: Boolean, defaultValue: false } });
  test.equal(schema.defaultValue('active'), false);
});

Tinytest.add('schema - getAllowedValuesForKey', function (test) {
  const schema = new MongoSchema({ status: { type: String, allowedValues: ['a', 'b'] } });
  const vals = schema.getAllowedValuesForKey('status');
  test.equal(vals[0], 'a');
  test.equal(vals[1], 'b');
});
