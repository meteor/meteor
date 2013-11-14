Tinytest.addAsync(
  "livedata server - sessionHandle.onClose()",
  function (test, onComplete) {
    var connection;
    var callbackHandle = Meteor.server.onConnection(function (sessionHandle) {
      callbackHandle.stop();
      test.isTrue(_.isString(sessionHandle.id), "sessionHandle.id exists and is a string");
      // On the server side, wait for the connection to be closed.
      sessionHandle.onClose(function () {
        onComplete();
      });
      // Close the connection from the client.
      connection.disconnect();
    });
    connection = DDP.connect(Meteor.absoluteUrl());
  }
);

Tinytest.addAsync(
  "livedata server - sessionHandle.close()",
  function (test, onComplete) {

    // XXX I don't understand why using `bindEnvironment` here is
    // necessary, but I get "Meteor code must always run within a
    // Fiber. Try wrapping callbacks that you pass to non-Meteor
    // libraries with Meteor.bindEnvironment" if I don't.
    done = Meteor.bindEnvironment(
      function () {
        Meteor.defer(onComplete);
      },
      function (err) {
        Meteor._debug("Exception thrown from Meteor.defer", err && err.stack);
      }
    );

    var connection;
    var callbackHandle = Meteor.server.onConnection(function (sessionHandle) {
      callbackHandle.stop();
      // Wait for connection to be closed on the client side.
      Deps.autorun(function (computation) {
        if (computation.firstRun)
          test.isTrue(connection.status().connected);
        if (! connection.status().connected) {
          computation.stop();
          // Avoid reconnecting from the client.
          connection.disconnect();
          done();
        }
      });
      // Close the connection from the server.
      sessionHandle.close();
    });
    connection = DDP.connect(Meteor.absoluteUrl());
  }
);  


var innerCalled = null;

Meteor.methods({
  livedata_server_test_inner: function () {
    var sessionId = this.sessionId;
    Meteor.defer(function () {
      innerCalled(sessionId);
    });
  },

  livedata_server_test_outer: function () {
    Meteor.call('livedata_server_test_inner');
  }
});


Tinytest.addAsync(
  "livedata server - sessionId in method invocation",
  function (test, onComplete) {
    var sessionId;
    var callbackHandle = Meteor.server.onConnection(function (sessionHandle) {
      callbackHandle.stop();
      sessionId = sessionHandle.id;
    });
    innerCalled = function (methodSessionId) {
      test.equal(methodSessionId, sessionId);
      onComplete();
    };
    var connection = DDP.connect(Meteor.absoluteUrl());
    connection.call('livedata_server_test_inner');
    connection.disconnect();
  }
);


Tinytest.addAsync(
  "livedata server - sessionId in nested method invocation",
  function (test, onComplete) {
    var sessionId;
    var callbackHandle = Meteor.server.onConnection(function (sessionHandle) {
      callbackHandle.stop();
      sessionId = sessionHandle.id;
    });
    innerCalled = function (methodSessionId) {
      test.equal(methodSessionId, sessionId);
      onComplete();
    };
    var connection = DDP.connect(Meteor.absoluteUrl());
    connection.call('livedata_server_test_outer');
    connection.disconnect();
  }
);
