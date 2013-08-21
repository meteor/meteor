Tinytest.add('random', function (test) {
  // Deterministic with a specified seed, which should generate the
  // same sequence in all environments.
  //
  // For repeatable unit test failures using deterministic random
  // number sequences it's fine if a new Meteor release changes the
  // algorithm being used and it starts generating a different
  // sequence for a seed, as long as the sequence is consistent for
  // a particular release.
  var random = Random.create(0);
  test.equal(random.id(), "cp9hWvhg8GSvuZ9os");
  test.equal(random.id(), "3f3k6Xo7rrHCifQhR");
  test.equal(random.id(), "shxDnjWWmnKPEoLhM");
  test.equal(random.id(), "6QTjB8C5SEqhmz4ni");
});
