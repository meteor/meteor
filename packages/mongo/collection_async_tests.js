Tinytest.add('async collection - check for methods presence', function (test) {
  const isFunction = fn => test.equal(typeof fn, 'function');

  const collection = new Mongo.Collection('myAsyncCollection' + test.id);
  isFunction(collection.createCappedCollectionAsync);
  isFunction(collection.createIndexAsync);
  isFunction(collection.dropCollectionAsync);
  isFunction(collection.dropIndexAsync);
  isFunction(collection.findOneAsync);
  isFunction(collection.insertAsync);
  isFunction(collection.removeAsync);
  isFunction(collection.updateAsync);
  isFunction(collection.upsertAsync);

  const cursor = collection.find();
  isFunction(cursor.countAsync);
  isFunction(cursor.fetchAsync);
  isFunction(cursor.forEachAsync);
  isFunction(cursor.mapAsync);
  isFunction(cursor[Symbol.asyncIterator]);
});
