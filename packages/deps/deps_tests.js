Tinytest.add('deps - autorun', function (test) {
  var listeners = new Meteor.deps._ContextSet;
  var x = 0;
  var handle = Meteor.autorun(function (handle) {
    listeners.addCurrentContext();
    ++x;
  });
  test.equal(x, 1);
  Meteor.flush();
  test.equal(x, 1);
  listeners.invalidateAll();
  test.equal(x, 1);
  Meteor.flush();
  test.equal(x, 2);
  listeners.invalidateAll();
  test.equal(x, 2);
  Meteor.flush();
  test.equal(x, 3);
  listeners.invalidateAll();
  // Prevent the function from running further.
  handle.stop();
  Meteor.flush();
  test.equal(x, 3);
  listeners.invalidateAll();
  Meteor.flush();
  test.equal(x, 3);

  Meteor.autorun(function (internalHandle) {
    listeners.addCurrentContext();
    ++x;
    if (x == 6)
      internalHandle.stop();
  });
  test.equal(x, 4);
  listeners.invalidateAll();
  Meteor.flush();
  test.equal(x, 5);
  listeners.invalidateAll();
  // Increment to 6 and stop.
  Meteor.flush();
  test.equal(x, 6);
  listeners.invalidateAll();
  Meteor.flush();
  // Still 6!
  test.equal(x, 6);
});
