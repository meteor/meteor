// packages/mongo-schema/tests/collection_integration_tests.js
import { Tinytest } from 'meteor/tinytest';
import { Mongo } from 'meteor/mongo';
import { Random } from 'meteor/random';
import { MongoSchema } from 'meteor/mongo-schema';

Tinytest.add('integration - attachSchema adds schema', function (test) {
  const col = new Mongo.Collection(Random.id());
  const schema = new MongoSchema({ name: String });
  col.attachSchema(schema);
  test.isTrue(col.schema() !== undefined);
  test.isTrue(col.schema()._isMongoSchema);
});

Tinytest.add('integration - attachSchema merge', function (test) {
  const col = new Mongo.Collection(Random.id());
  col.attachSchema(new MongoSchema({ name: String }));
  col.attachSchema(new MongoSchema({ age: Number }));
  const schema = col.schema();
  test.isTrue(schema._ir.has('name'));
  test.isTrue(schema._ir.has('age'));
});

Tinytest.add('integration - attachSchema replace', function (test) {
  const col = new Mongo.Collection(Random.id());
  col.attachSchema(new MongoSchema({ name: String }));
  col.attachSchema(new MongoSchema({ age: Number }), { replace: true });
  const schema = col.schema();
  test.isFalse(schema._ir.has('name'));
  test.isTrue(schema._ir.has('age'));
});

Tinytest.addAsync('integration - insertAsync validates', async function (test) {
  const col = new Mongo.Collection(Random.id());
  col.attachSchema(new MongoSchema({ name: String, age: Number }));
  // Valid
  const id = await col.insertAsync({ name: 'Alice', age: 25 });
  test.isTrue(typeof id === 'string');
  // Invalid — missing required field
  try {
    await col.insertAsync({ name: 'Bob' });
    test.fail('Should have thrown');
  } catch (e) {
    test.equal(e.error, 'validation-error');
    test.equal(e.details[0].name, 'age');
  }
});

Tinytest.addAsync('integration - insertAsync applies clean', async function (test) {
  const col = new Mongo.Collection(Random.id());
  col.attachSchema(new MongoSchema({
    name: String,
    active: { type: Boolean, defaultValue: true },
  }));
  const id = await col.insertAsync({ name: '  Alice  ' });
  const doc = await col.findOneAsync(id);
  test.equal(doc.name, 'Alice'); // trimmed
  test.equal(doc.active, true); // defaultValue applied
});

Tinytest.addAsync('integration - insertAsync with autoValue context', async function (test) {
  const col = new Mongo.Collection(Random.id());
  col.attachSchema(new MongoSchema({
    name: String,
    createdAt: {
      type: Date,
      autoValue() {
        if (this.isInsert) return new Date();
      },
    },
  }));
  const id = await col.insertAsync({ name: 'Alice' });
  const doc = await col.findOneAsync(id);
  test.instanceOf(doc.createdAt, Date);
});

Tinytest.addAsync('integration - updateAsync validates', async function (test) {
  const col = new Mongo.Collection(Random.id());
  col.attachSchema(new MongoSchema({
    name: String,
    age: { type: Number, min: 0 },
  }));
  const id = await col.insertAsync({ name: 'Alice', age: 25 });
  // Valid update
  await col.updateAsync(id, { $set: { age: 30 } });
  // Invalid update
  try {
    await col.updateAsync(id, { $set: { age: -1 } });
    test.fail('Should have thrown');
  } catch (e) {
    test.equal(e.error, 'validation-error');
  }
});

Tinytest.addAsync('integration - validate false skips validation', async function (test) {
  const col = new Mongo.Collection(Random.id());
  col.attachSchema(new MongoSchema({ name: String, age: Number }));
  // Should succeed even though age is missing
  const id = await col.insertAsync({ name: 'Alice' }, { validate: false });
  test.isTrue(typeof id === 'string');
});

Tinytest.addAsync('integration - bypassSchema skips everything', async function (test) {
  const col = new Mongo.Collection(Random.id());
  col.attachSchema(new MongoSchema({ name: String }));
  const id = await col.insertAsync({ anything: 'goes' }, { bypassSchema: true });
  const doc = await col.findOneAsync(id);
  test.equal(doc.anything, 'goes');
});

Tinytest.addAsync('integration - removeAsync passes through', async function (test) {
  const col = new Mongo.Collection(Random.id());
  col.attachSchema(new MongoSchema({ name: String }));
  const id = await col.insertAsync({ name: 'Alice' });
  const removed = await col.removeAsync(id);
  test.equal(removed, 1);
});

Tinytest.addAsync('integration - wrong type on insert throws', async function (test) {
  const col = new Mongo.Collection(Random.id());
  col.attachSchema(new MongoSchema({ name: String }));
  try {
    await col.insertAsync({ name: 123 });
    test.fail('Should have thrown');
  } catch (e) {
    test.equal(e.details[0].type, 'expectedType');
  }
});
