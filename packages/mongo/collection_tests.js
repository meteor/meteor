Tinytest.add(
  'collection - call Mongo.Collection without new',
  function (test) {
    test.throws(function () {
      Mongo.Collection(null);
    });
  }
);

Tinytest.add('collection - call new Mongo.Collection multiple times',
  function (test) {
    var collectionName = 'multiple_times_1_' + test.id;
    new Mongo.Collection(collectionName);

    test.throws(
      function () {
        new Mongo.Collection(collectionName);
      },
      /There is already a collection named/
    );
  }
);

Tinytest.add('collection - call new Mongo.Collection multiple times with _suppressSameNameError=true',
  function (test) {
    var collectionName = 'multiple_times_2_' + test.id;
    new Mongo.Collection(collectionName);

    try {
      new Mongo.Collection(collectionName, {_suppressSameNameError: true});
      test.ok();
    } catch (error) {
      console.log(error);
      test.fail('Expected new Mongo.Collection not to throw an error when called twice with the same name');
    }
  }
);

Tinytest.add('collection - call new Mongo.Collection with defineMutationMethods=false',
  function (test) {
    var handlerPropName = Meteor.isClient ? '_methodHandlers' : 'method_handlers';

    var methodCollectionName = 'hasmethods' + test.id;
    var hasmethods = new Mongo.Collection(methodCollectionName);
    test.equal(typeof hasmethods._connection[handlerPropName]['/' + methodCollectionName + '/insert'], 'function');

    var noMethodCollectionName = 'nomethods' + test.id;
    var nomethods = new Mongo.Collection(noMethodCollectionName, {defineMutationMethods: false});
    test.equal(nomethods._connection[handlerPropName]['/' + noMethodCollectionName + '/insert'], undefined);
  }
);

Tinytest.add('collection - call find with sort function',
  function (test) {
    var initialize = function (collection) {
      collection.insert({a: 2});
      collection.insert({a: 3});
      collection.insert({a: 1});
    };

    var sorter = function (a, b) {
      return a.a - b.a;
    };

    var getSorted = function (collection) {
      return collection.find({}, {sort: sorter}).map(function (doc) { return doc.a; });
    };

    var collectionName = 'sort' + test.id;
    var localCollection = new Mongo.Collection(null);
    var namedCollection = new Mongo.Collection(collectionName, {connection: null});

    initialize(localCollection);
    test.equal(getSorted(localCollection), [1, 2, 3]);

    initialize(namedCollection);
    test.equal(getSorted(namedCollection), [1, 2, 3]);
  }
);

Tinytest.add('collection - call native find with sort function',
  function (test) {
    var collectionName = 'sortNative' + test.id;
    var nativeCollection = new Mongo.Collection(collectionName);

    if (Meteor.isServer) {
      test.throws(
        function () {
          nativeCollection
            .find({}, {
              sort: function () {},
            })
            .map(function (doc) {
              return doc.a;
            });
        },
        /Illegal sort clause/
      );
    }
  }
);

Tinytest.add('collection - calling native find with maxTimeMs should timeout',
  function(test) {
    var collectionName = 'findOptions1' + test.id;
    var collection = new Mongo.Collection(collectionName);
    collection.insert({a: 1});

    function doTest() {
      return collection.find({$where: "sleep(100) || true"}, {maxTimeMs: 50}).count();
    }
    if (Meteor.isServer) {
      test.throws(doTest);
    }
  }
);


Tinytest.add('collection - calling native find with $reverse hint should reverse on server',
  function(test) {
    var collectionName = 'findOptions2' + test.id;
    var collection = new Mongo.Collection(collectionName);
    collection.insert({a: 1});
    collection.insert({a: 2});

    function m(doc) { return doc.a; }
    var fwd = collection.find({}, {hint: {$natural: 1}}).map(m);
    var rev = collection.find({}, {hint: {$natural: -1}}).map(m);
    if (Meteor.isServer) {
      test.equal(fwd, rev.reverse());
    } else {
      // NOTE: should be documented that hints don't work on client
      test.equal(fwd, rev);
    }
  }
);

Tinytest.addAsync('collection - calling native find with good hint and maxTimeMs should succeed',
  function(test, done) {
    var collectionName = 'findOptions3' + test.id;
    var collection = new Mongo.Collection(collectionName);
    collection.insert({a: 1});

    Promise.resolve(
      Meteor.isServer &&
        collection.rawCollection().createIndex({ a: 1 })
    ).then(() => {
      test.equal(collection.find({}, {
        hint: {a: 1},
        maxTimeMs: 1000
      }).count(), 1);
      done();
    }).catch(error => test.fail(error.message));
  }
);
