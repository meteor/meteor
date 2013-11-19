var Fiber = Npm.require('fibers');

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

// like pollUntil but doesn't have to be called from testAsyncMulti.
var poll = function (test, onComplete, fn) {
  var timeout = 10000;
  var step = 200;
  var start = (new Date()).valueOf();
  var helper = function () {
    if (fn()) {
      test.ok();
      onComplete();
      return;
    }
    if (start + timeout < (new Date()).valueOf()) {
      test.fail();
      onComplete();
      return;
    }
    Meteor.setTimeout(helper, step);
  };
  helper();
};
  
Tinytest.addAsync("livedata server - sessionHandle.close()", function (test, onComplete) {
  var connection;
  var callbackHandle = Meteor.server.onConnection(function (sessionHandle) {
    callbackHandle.stop();

    poll(test, onComplete, function () {
      return ! connection.status().connected;
    });

    // Close the connection from the server.
    sessionHandle.close();
  });

  connection = DDP.connect(Meteor.absoluteUrl(), {retry: false});
});



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
