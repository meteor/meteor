Tinytest.only(
  'async collection - create Mongo.Collection and check the name',
  function(test) {
    const collection = Mongo.Collection.create('myAsyncCollection');
    test.equal(collection._name, 'myAsyncCollection');
  }
);

Tinytest.only(
  'async collection - create sync Mongo.Collection and try to use async insert',
  function(test) {
    const collection = new Mongo.Collection('myAsyncCollection');

    test.throws(
      collection.insertAsync({
        name: 'test',
      })
    );
  }
);

Tinytest.only('async collection - reusing instances when we have the same name', function(
  test
) {
  const collection = new Mongo.Collection('myCollection');
  const collAsync = Mongo.Collection.create('myCollection');
  test.equal(collection._name, 'myCollection');
  test.equal(collAsync._name, 'myCollection');
  test.equal(new Mongo.Collection('myCollection2')._name, 'myCollection2');
  test.equal(new Mongo.Collection('myCollection2')._name, 'myCollection2');

  test.equal(Mongo.Collection.create('myCollection3')._name, 'myCollection3');
  test.equal(Mongo.Collection.create('myCollection3')._name, 'myCollection3');
});
