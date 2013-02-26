Tinytest.add('deps - autorun', function (test) {
  var v = new Deps.Variable;
  var x = 0;
  var handle = Deps.autorun(function (handle) {
    Deps.depend(v);
    ++x;
  });
  test.equal(x, 1);
  Deps.flush();
  test.equal(x, 1);
  v.changed();
  test.equal(x, 1);
  Deps.flush();
  test.equal(x, 2);
  v.changed();
  test.equal(x, 2);
  Deps.flush();
  test.equal(x, 3);
  v.changed();
  // Prevent the function from running further.
  handle.stop();
  Deps.flush();
  test.equal(x, 3);
  v.changed();
  Deps.flush();
  test.equal(x, 3);

  Deps.autorun(function (internalHandle) {
    Deps.depend(v);
    ++x;
    if (x == 6)
      internalHandle.stop();
  });
  test.equal(x, 4);
  v.changed();
  Deps.flush();
  test.equal(x, 5);
  v.changed();
  // Increment to 6 and stop.
  Deps.flush();
  test.equal(x, 6);
  v.changed();
  Deps.flush();
  // Still 6!
  test.equal(x, 6);
});
