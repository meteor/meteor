Tinytest.addAsync('mongo-decimal - insert/find Decimal', async function (test) {
  var coll = new Mongo.Collection('mongo-decimal');
  var pi = Decimal('3.141592653589793');

  await coll.insertAsync({pi: pi});
  var found = await coll.findOneAsync({pi: pi});

  test.equal(found.pi, pi);
});
