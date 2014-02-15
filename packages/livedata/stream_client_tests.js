var Fiber = Npm.require('fibers');

Tinytest.addAsync("stream client - callbacks run in a fiber", function (test, onComplete) {
  stream = new LivedataTest.ClientStream(
    Meteor.absoluteUrl(),
    {
      _testOnClose: function () {
        test.isTrue(Fiber.current);
        onComplete();
      }
    }
  );
  stream.on('reset', function () {
    test.isTrue(Fiber.current);
    stream.disconnect();
  });
});
