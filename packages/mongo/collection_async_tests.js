Tinytest.only(
  'async collection - create Mongo.Collection and check the name',
  function (test) {
    const collection = Mongo.Collection.create('myAsyncCollection');
    test.equal(
      collection._name,
      'myAsyncCollection'
    )
  }
);

Tinytest.only(
  'async collection - create sync Mongo.Collection and try to use async insert',
  function (test) {
    const collection = new Mongo.Collection('myAsyncCollection');


    test.throws(
      collection.insertAsync({
        name: 'test'
      }),
    )
  }
);


Tinytest.only(
  'async collection - create collections with same name',
  function (test) {
    const collection = new Mongo.Collection('myCollection');
    const collAsync = Mongo.Collection.create('myCollection');
    test.ok(
      collection
    )
    test.ok(
      collAsync
    )
    new Mongo.Collection('myCollection2');
    test.throws(new Mongo.Collection('myCollection2'));

    Mongo.Collection.create('myCollection3');
    test.throws(Mongo.Collection.create('myCollection3'));
  }
);
