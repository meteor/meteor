var Fiber = Npm.require('fibers');

testAsyncMulti("stream client - callbacks run in a fiber", [
  function (test, expect) {
    var stream = new LivedataTest.ClientStream(Meteor.absoluteUrl());
    stream.on('reset', expect(function () {
      test.isTrue(Fiber.current);
      stream.disconnect();
    }));
  }
]);
