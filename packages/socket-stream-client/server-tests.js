import { Meteor } from "meteor/meteor";
import { ClientStream } from "meteor/socket-stream-client";
import Fiber from "fibers";

testAsyncMulti('stream client - callbacks run in a fiber', [
  function(test, expect) {
    var stream = new ClientStream(Meteor.absoluteUrl());

    var messageFired = false;
    var resetFired = false;

    stream.on(
      'message',
      expect(function() {
        test.isTrue(Fiber.current);
        if (resetFired) stream.disconnect();
        messageFired = true;
      })
    );

    stream.on(
      'reset',
      expect(function() {
        test.isTrue(Fiber.current);
        if (messageFired) stream.disconnect();
        resetFired = true;
      })
    );
  }
]);
