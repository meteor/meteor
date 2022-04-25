Tinytest.add(
  'async collection - create Mongo.Collection and check the name',
  function(test) {
    const collection = Mongo.Collection.create('myAsyncCollection');
    test.equal(collection._name, 'myAsyncCollection');
  }
);

Tinytest.add(
  'async collection - reusing Mongo.Collection instances for the same name',
  function(test) {
    test.equal(new Mongo.Collection('myCollection')._name, 'myCollection');
    test.equal(Mongo.Collection.create('myCollection')._name, 'myCollection');

    test.equal(new Mongo.Collection('myCollection2')._name, 'myCollection2');
    test.equal(new Mongo.Collection('myCollection2')._name, 'myCollection2');

    test.equal(Mongo.Collection.create('myCollection3')._name, 'myCollection3');
    test.equal(Mongo.Collection.create('myCollection3')._name, 'myCollection3');
  }
);

Tinytest.add(
  'async collection - create sync Mongo.Collection and try to use async insert',
  function(test) {
    const collection = new Mongo.Collection('myAsyncCollection');
    // FIXME: It'd be nice to have `test.throws` that understands `Promise`s.
    test.throws(
      () => collection.insertAsync({ name: 'test' }),
      'It is only allowed to use "insertAsync" method in async collections'
    );
  }
);

Tinytest.add('async collection - check for methods presence', function(test) {
  const isFunction = fn => test.equal(typeof fn, 'function');

  const collection = Mongo.Collection.create('myAsyncCollection');
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
