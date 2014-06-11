Tinytest.add(
  'collection - call Meteor.RedisCollection without new',
  function (test) {
    test.throws(
      function () {
        Meteor.RedisCollection(null);
      },
      /use "new" to construct a Meteor\.RedisCollection/
    );
  }
);
