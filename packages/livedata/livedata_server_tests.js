var Fiber = Npm.require('fibers');

// like pollUntil but doesn't have to be called from testAsyncMulti.
//
// Call `fn` periodically until it returns true.  If it does, call
// `success`.  If it doesn't before the timeout, call `failed`.
//
// An implementation that used fibers would be easier to use, but
// don't want to rule out the possibility of eventually also running
// these tests from the client (which would need an additional
// signaling mechanism to tell the server when to do particular steps
// such as closing the connection on the server side).
var poll = function (fn, success, failed) {
  var timeout = 10000;
  var step = 200;
  var start = (new Date()).valueOf();
  var helper = function () {
    if (fn()) {
      success();
      return;
    }
    if (start + timeout < (new Date()).valueOf()) {
      failed();
      return;
    }
    Meteor.setTimeout(helper, step);
  };
  helper();
};


// Establish a connection from the server to the server, and wait
// until the client side of the connection has received the session
// id.  On success call `succeeded` with two arguments, the client
// side `connection` and the server side `session`.  Call `failed` on
// failure.
var establishConnection = function (test, succeeded, failed) {
  // The connection from the client side.
  var connection;

  // Track incoming sessions server side until we know which one is
  // ours.
  var sessions = {};

  // Add incoming sessions to `sessions`.
  var onConnectionHandle = Meteor.onConnection(function (session) {
    test.isTrue(_.isString(session.id), "session handle id exists and is a string");
    if (sessions[session.id]) {
      test.fail("onConnection callback called multiple times for same session id");
      failed();
    }
    else {
      sessions[session.id] = session;
    }
  });

  // We've succeeded when we get the session id on the client side.
  var onClientSessionId = function (sessionId) {
    test.isTrue(connection.status().connected);
    var session = sessions[sessionId];
    if (! session) {
      test.fail("No onConnection received server side for connected client");
      failed();
    }
    else {
      onConnectionHandle.stop();
      succeeded(connection, session);
    }
  };

  // Connect and wait until the connection receives its session id.
  // Disable retries so that when the connection is closed we don't
  // automatically keep reconnecting on the client side.
  connection = DDP.connect(Meteor.absoluteUrl(), {retry: false});
  poll(
    function () {
      return connection._lastSessionId;
    },
    function () {
      onClientSessionId(connection._lastSessionId);
    },
    function () {
      test.fail("client side of connection did not receive a session id");
      failed();
    }
  );
};

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
        poll(
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


var innerCalled = null;

Meteor.methods({
  livedata_server_test_inner: function () {
    var self = this;
    Meteor.defer(function () {
      innerCalled(self);
    });
  },

  livedata_server_test_outer: function () {
    Meteor.call('livedata_server_test_inner');
  }
});


Tinytest.addAsync(
  "livedata server - session in method invocation",
  function (test, onComplete) {
    establishConnection(
      test,
      function (connection, session) {
        innerCalled = function (methodInvocation) {
          test.equal(methodInvocation.session.id, session.id);
          onComplete();
        };
        connection.call('livedata_server_test_inner');
        connection.disconnect();
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
        innerCalled = function (methodInvocation) {
          test.equal(methodInvocation.session.id, session.id);
          onComplete();
        };
        connection.call('livedata_server_test_outer');
        connection.disconnect();
      },
      onComplete
    );
  }
);
    

Tinytest.addAsync(
  "livedata server - session data in nested method invocation",
  function (test, onComplete) {
    establishConnection(
      test,
      function (connection, session) {
        session._sessionData.foo = 123;
        innerCalled = function (methodInvocation) {
          test.equal(methodInvocation._sessionData.foo, 123);
          onComplete();
        };
        connection.call('livedata_server_test_outer');
        connection.disconnect();
      },
      onComplete
    );
  }
);
