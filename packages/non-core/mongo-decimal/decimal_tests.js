Tinytest.add('mongo-decimal - insert/find Decimal', function (test) {
  var coll = new Mongo.Collection('mongo-decimal');
  var pi = Decimal('3.141592653589793');

  coll.insert({pi: pi});
  var found = coll.findOne({pi: pi});

  test.equal(found.pi, pi);
});
