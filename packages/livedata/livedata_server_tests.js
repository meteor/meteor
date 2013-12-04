var Fiber = Npm.require('fibers');


Tinytest.addAsync(
  "livedata server - connectionHandle.onClose()",
  function (test, onComplete) {
    makeTestConnection(
      test,
      function (clientConn, serverConn) {
        // On the server side, wait for the connection to be closed.
        serverConn.onClose(function () {
          onComplete();
        });
        // Close the connection from the client.
        clientConn.disconnect();
      },
      onComplete
    );
  }
);

Tinytest.addAsync(
  "livedata server - connectionHandle.close()",
  function (test, onComplete) {
    makeTestConnection(
      test,
      function (clientConn, serverConn) {
        // Wait for the connection to be closed from the server side.
        simplePoll(
          function () {
            return ! clientConn.status().connected;
          },
          onComplete,
          function () {
            test.fail("timeout waiting for the connection to be closed on the server side");
            onComplete();
          }
        );

        // Close the connection from the server.
        serverConn.close();
      },
      onComplete
    );
  }
);


Meteor.methods({
  livedata_server_test_inner: function () {
    return this.connection.id;
  },

  livedata_server_test_outer: function () {
    return Meteor.call('livedata_server_test_inner');
  }
});


Tinytest.addAsync(
  "livedata server - connection in method invocation",
  function (test, onComplete) {
    makeTestConnection(
      test,
      function (clientConn, serverConn) {
        var res = clientConn.call('livedata_server_test_inner');
        test.equal(res, serverConn.id);
        clientConn.disconnect();
        onComplete();
      },
      onComplete
    );
  }
);


Tinytest.addAsync(
  "livedata server - connection in nested method invocation",
  function (test, onComplete) {
    makeTestConnection(
      test,
      function (clientConn, serverConn) {
        var res = clientConn.call('livedata_server_test_outer');
        test.equal(res, serverConn.id);
        clientConn.disconnect();
        onComplete();
      },
      onComplete
    );
  }
);


// connectionId -> callback
var onSubscription = {};

Meteor.publish("livedata_server_test_sub", function (connectionId) {
  var callback = onSubscription[connectionId];
  if (callback)
    callback(this);
  this.stop();
});


Tinytest.addAsync(
  "livedata server - connection in publish function",
  function (test, onComplete) {
    makeTestConnection(
      test,
      function (clientConn, serverConn) {
        onSubscription[serverConn.id] = function (subscription) {
          delete onSubscription[serverConn.id];
          test.equal(subscription.connection.id, serverConn.id);
          clientConn.disconnect();
          onComplete();
        };
        clientConn.subscribe("livedata_server_test_sub", serverConn.id);
      }
    );
  }
);
