Tinytest.addAsync("mongo-decimal - insert/find Decimal", async function (test) {
  // TODO [fibers]: this should work on the client as well.
    // it looks like we should insert just in the minimongo and then test,
    // but right now the coll.insertAsync is finishing when the server side finishes
    // meaning the data on the client side is no longer there. Maybe the idea of accept callbacks
    // on the new Async methods could solve these issues.
  if (Meteor.isClient) return;

  var coll = new Mongo.Collection("mongo-decimal");
  var pi = Decimal("3.141592653589793");

  await coll.insertAsync({ pi: pi });
  var found = await coll.findOneAsync({ pi: pi });

  test.equal(found.pi, pi);
});
