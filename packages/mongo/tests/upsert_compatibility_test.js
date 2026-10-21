import { replaceTypes, replaceNames, replaceMeteorAtomWithMongo, replaceMongoAtomWithMeteor } from '../mongo_common';

Tinytest.add('mongo - review atom conversion preserves data and prototypes', test => {
  for (const prototype of [Object.prototype, null, Array.prototype]) {
    for (const value of [{owner: 'nested'}, null, 'ordinary']) {
      const document = prototype === Array.prototype ? [] : Object.create(prototype);
      Object.defineProperty(document, '__proto__', {value, enumerable: true, writable: true, configurable: true});
      document.reference = new Mongo.ObjectID();
      if (!Array.isArray(document)) document.constructor = 'ordinary constructor';
      const bson = replaceTypes(document, replaceMeteorAtomWithMongo);
      test.equal(Object.getPrototypeOf(bson), prototype);
      test.isTrue(Object.prototype.hasOwnProperty.call(bson, '__proto__'));
      test.equal(bson.__proto__, value);
      test.isUndefined(bson.owner);
      test.isTrue(bson.reference instanceof NpmModuleMongodb.ObjectId);
      const restored = replaceTypes(bson, replaceMongoAtomWithMeteor);
      test.equal(Object.getPrototypeOf(restored), prototype);
      test.isTrue(Object.prototype.hasOwnProperty.call(restored, '__proto__'));
      test.equal(restored.__proto__, value);
      test.isUndefined(restored.owner);
      test.isTrue(restored.reference instanceof Mongo.ObjectID);
      test.equal(restored.reference, document.reference);
      if (!Array.isArray(document)) test.equal(restored.constructor, 'ordinary constructor');
    }
  }
  const unchanged = JSON.parse('{"ordinary":1,"__proto__":{"owner":"nested"}}');
  test.isTrue(replaceTypes(unchanged, replaceMeteorAtomWithMongo) === unchanged);
  const restoredName = replaceNames(name => name.substring(5), JSON.parse('{"EJSON__proto__":{"EJSONowner":"nested"},"EJSONpublic":1}'));
  test.isTrue(Object.prototype.hasOwnProperty.call(restoredName, '__proto__'));
  test.equal(Object.getPrototypeOf(restoredName), Object.prototype);
  test.equal(restoredName.__proto__.owner, 'nested');
  test.isUndefined(restoredName.owner);
  test.equal(restoredName.public, 1);
});

Tinytest.addAsync(
  'mongo livedata - native upsert - id type MONGO with MODIFIERS update',
  async function(test) {
    var collName = Random.id();
    var coll = new Mongo.Collection('native_upsert_' + collName, {
      idGeneration: 'MONGO',
    });

    await coll.insertAsync({ foo: 1 });
    var result = await coll.upsertAsync({ foo: 1 }, { $set: { foo: 2 } });
    var updated = await coll.findOneAsync({ foo: 2 });

    test.equal(result.insertedId, undefined);
    test.equal(result.numberAffected, 1);

    test.isTrue(updated._id instanceof Mongo.ObjectID);

    delete updated['_id'];
    test.equal(EJSON.equals(updated, { foo: 2 }), true);
  }
);

Tinytest.addAsync(
  'mongo livedata - native upsert - id type MONGO with MODIFIERS insert',
  async function(test) {
    var collName = Random.id();
    var coll = new Mongo.Collection('native_upsert_' + collName, {
      idGeneration: 'MONGO',
    });

    var result = await coll.upsertAsync({ foo: 1 }, { $set: { bar: 2 } });
    var inserted = await coll.findOneAsync({ foo: 1 });

    test.isTrue(result.insertedId !== undefined);
    test.equal(result.numberAffected, 1);

    test.isTrue(inserted._id instanceof Mongo.ObjectID);
    test.equal(inserted._id, result.insertedId);

    delete inserted['_id'];
    test.equal(EJSON.equals(inserted, { foo: 1, bar: 2 }), true);
  }
);

Tinytest.addAsync(
  'mongo livedata - native upsert - id type MONGO PLAIN OBJECT update',
  async function(test) {
    var collName = Random.id();
    var coll = new Mongo.Collection('native_upsert_' + collName, {
      idGeneration: 'MONGO',
    });

    await coll.insertAsync({ foo: 1, baz: 42 });
    var result = await coll.upsertAsync({ foo: 1 }, { bar: 2 });
    var updated = await coll.findOneAsync({ bar: 2 });

    test.isTrue(result.insertedId === undefined);
    test.equal(result.numberAffected, 1);

    test.isTrue(updated._id instanceof Mongo.ObjectID);

    delete updated['_id'];
    test.equal(EJSON.equals(updated, { bar: 2 }), true);
  }
);

Tinytest.addAsync(
  'mongo livedata - native upsert - id type MONGO PLAIN OBJECT insert',
  async function(test) {
    var collName = Random.id();
    var coll = new Mongo.Collection('native_upsert_' + collName, {
      idGeneration: 'MONGO',
    });

    var result = await coll.upsertAsync({ foo: 1 }, { bar: 2 });
    var inserted = await coll.findOneAsync({ bar: 2 });

    test.isTrue(result.insertedId !== undefined);
    test.equal(result.numberAffected, 1);

    test.isTrue(inserted._id instanceof Mongo.ObjectID);
    test.isTrue(result.insertedId instanceof Mongo.ObjectID);
    test.equal(inserted._id, result.insertedId);

    delete inserted['_id'];
    test.equal(EJSON.equals(inserted, { bar: 2 }), true);
  }
);

Tinytest.addAsync(
  'mongo livedata - native upsert - id type STRING with MODIFIERS update',
  async function(test) {
    var collName = Random.id();
    var coll = new Mongo.Collection('native_upsert_' + collName, {
      idGeneration: 'STRING',
    });

    await coll.insertAsync({ foo: 1 });
    var result = await coll.upsertAsync({ foo: 1 }, { $set: { foo: 2 } });
    var updated = await coll.findOneAsync({ foo: 2 });

    test.equal(result.insertedId, undefined);
    test.equal(result.numberAffected, 1);

    test.isTrue(typeof updated._id === 'string');

    delete updated['_id'];
    test.equal(EJSON.equals(updated, { foo: 2 }), true);
  }
);

Tinytest.addAsync(
  'mongo livedata - native upsert - id type STRING with MODIFIERS insert',
  async function(test) {
    var collName = Random.id();
    var coll = new Mongo.Collection('native_upsert_' + collName, {
      idGeneration: 'STRING',
    });

    var result = await coll.upsertAsync({ foo: 1 }, { $set: { bar: 2 } });
    var inserted = await coll.findOneAsync({ foo: 1 });

    test.isTrue(result.insertedId !== undefined);
    test.equal(result.numberAffected, 1);

    test.isTrue(typeof inserted._id === 'string');
    test.equal(inserted._id, result.insertedId);

    delete inserted['_id'];
    test.equal(EJSON.equals(inserted, { foo: 1, bar: 2 }), true);
  }
);

Tinytest.addAsync(
  'mongo livedata - native upsert - id type STRING PLAIN OBJECT update',
  async function(test) {
    var collName = Random.id();
    var coll = new Mongo.Collection('native_upsert_' + collName, {
      idGeneration: 'STRING',
    });

    await coll.insertAsync({ foo: 1, baz: 42 });
    var result = await coll.upsertAsync({ foo: 1 }, { bar: 2 });
    var updated = await coll.findOneAsync({ bar: 2 });

    test.isTrue(result.insertedId === undefined);
    test.equal(result.numberAffected, 1);

    test.isTrue(typeof updated._id === 'string');

    delete updated['_id'];
    test.equal(EJSON.equals(updated, { bar: 2 }), true);
  }
);

Tinytest.addAsync(
  'mongo livedata - native upsert - id type STRING PLAIN OBJECT insert',
  async function(test) {
    var collName = Random.id();
    var coll = new Mongo.Collection('native_upsert_' + collName, {
      idGeneration: 'STRING',
    });

    var result = await coll.upsertAsync({ foo: 1 }, { bar: 2 });
    var inserted = await coll.findOneAsync({ bar: 2 });

    test.isTrue(result.insertedId !== undefined);
    test.equal(result.numberAffected, 1);

    test.isTrue(typeof inserted._id === 'string');
    test.equal(inserted._id, result.insertedId);

    delete inserted['_id'];
    test.equal(EJSON.equals(inserted, { bar: 2 }), true);
  }
);

Tinytest.addAsync(
  'mongo livedata - native upsert - MONGO passing id insert',
  async function(test) {
    var collName = Random.id();
    var coll = new Mongo.Collection('native_upsert_' + collName, {
      idGeneration: 'MONGO',
    });

    var result = await coll.upsertAsync({ foo: 1 }, { _id: 'meu id' });
    var inserted = await coll.findOneAsync({ _id: 'meu id' });

    test.equal(result.insertedId, 'meu id');
    test.equal(result.numberAffected, 1);

    test.isTrue(typeof inserted._id === 'string');

    test.equal(EJSON.equals(inserted, { _id: 'meu id' }), true);
  }
);
