var Fiber = Npm.require('fibers');


Tinytest.addAsync(
  "livedata server - sessionHandle.onClose()",
  function (test, onComplete) {
    establishConnection(
      test,
      function (connection, session) {
        // On the server side, wait for the connection to be closed.
        session.onClose(function () {
          onComplete();
        });
        // Close the connection from the client.
        connection.disconnect();
      },
      onComplete
    );
  }
);


Tinytest.addAsync(
  "livedata server - sessionHandle.close()",
  function (test, onComplete) {
    establishConnection(
      test,
      function (connection, session) {
        // Wait for the connection to be closed from the server side.
        simplePoll(
          function () {
            return ! connection.status().connected;
          },
          onComplete,
          function () {
            test.fail("timeout waiting for the connection to be closed on the server side");
            onComplete();
          }
        );

        // Close the connection from the server.
        session.close();
      },
      onComplete
    );
  }
);


Meteor.methods({
  livedata_server_test_inner: function () {
    return this.session.id;
  },

  livedata_server_test_outer: function () {
    return Meteor.call('livedata_server_test_inner');
  }
});


Tinytest.addAsync(
  "livedata server - session in method invocation",
  function (test, onComplete) {
    establishConnection(
      test,
      function (connection, session) {
        var res = connection.call('livedata_server_test_inner');
        test.equal(res, session.id);
        connection.disconnect();
        onComplete();
      },
      onComplete
    );
  }
);


Tinytest.addAsync(
  "livedata server - session in nested method invocation",
  function (test, onComplete) {
    establishConnection(
      test,
      function (connection, session) {
        var res = connection.call('livedata_server_test_outer');
        test.equal(res, session.id);
        connection.disconnect();
        onComplete();
      },
      onComplete
    );
  }
);


// sessionId -> callback
var onSubscription = {};

Meteor.publish("livedata_server_test_sub", function (sessionId) {
  var callback = onSubscription[sessionId];
  if (callback)
    callback(this);
  this.stop();
});


Tinytest.addAsync(
  "livedata server - session in publish function",
  function (test, onComplete) {
    establishConnection(
      test,
      function (connection, session) {
        onSubscription[session.id] = function (subscription) {
          delete onSubscription[session.id];
          test.equal(subscription.session.id, session.id);
          connection.disconnect();
          onComplete();
        };
        connection.subscribe("livedata_server_test_sub", session.id);
      }
    );
  }
);
