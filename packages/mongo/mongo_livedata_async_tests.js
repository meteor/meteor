import { Mongo } from 'meteor/mongo';

Tinytest.add("mongo-async-api - check for presence", function (test) {
  const runId = test.runId();
  const isFunction = fn => test.equal(typeof fn, "function");

  const collection = Mongo.createAsyncCollection(`collection-${runId}`);
  isFunction(collection.createCappedCollectionAsync);
  isFunction(collection.createIndexAsync);
  isFunction(collection.dropCollectionAsync);
  isFunction(collection.dropIndexAsync);
  isFunction(collection.ensureIndexAsync);
  isFunction(collection.findOneAsync);
  isFunction(collection.insertAsync);
  isFunction(collection.rawCollectionAsync);
  isFunction(collection.rawDatabaseAsync);
  isFunction(collection.removeAsync);
  isFunction(collection.updateAsync);
  isFunction(collection.upsertAsync);

  const cursor = collection.find();
  isFunction(cursor.countAsync);
  isFunction(cursor.fetchAsync);
  isFunction(cursor.forEachAsync);
  isFunction(cursor.mapAsync);
});
