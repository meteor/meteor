var Fiber = Npm.require('fibers');

testAsyncMulti("stream client - callbacks run in a fiber", [
  function (test, expect) {
    var stream = new LivedataTest.ClientStream(Meteor.absoluteUrl());

    var messageFired = false;
    var resetFired = false;

    stream.on('message', expect(function () {
      test.isTrue(Fiber.current);
      if (resetFired)
        stream.disconnect();
      messageFired = true;
    }));

    stream.on('reset', expect(function () {
      test.isTrue(Fiber.current);
      if (messageFired)
        stream.disconnect();
      resetFired = true;
    }));
  }
]);
