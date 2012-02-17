test("livedata - basics", function () {
  // Very basic test. Just see that it runs.

  assert.isTrue(Meteor.is_client);
  assert.isFalse(Meteor.is_server);

  var coll = new Meteor.Collection("testing");

  coll.remove({foo: 'bar'});
  assert.length(coll.find({foo: 'bar'}).fetch(), 0);
  coll.insert({foo: 'bar'});
  assert.length(coll.find({foo: 'bar'}).fetch(), 1);
});

// XXX many more tests here!
