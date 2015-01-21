Tinytest.add(
  'collection - call Mongo.Collection without new',
  function (test) {
    test.throws(
      function () {
        Mongo.Collection(null);
      },
      /use "new" to construct a Mongo\.Collection/
    );
  }
);
