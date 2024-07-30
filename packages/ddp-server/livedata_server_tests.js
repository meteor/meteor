var Fiber = Npm.require('fibers');


Tinytest.addAsync(
  "livedata server - connectionHandle.onClose()",
  function (test, onComplete) {
    makeTestConnection(
      test,
      function (clientConn, serverConn) {
        // On the server side, wait for the connection to be closed.
        serverConn.onClose(function () {
          test.isTrue(true);
          // Add a new onClose after the connection is already
          // closed. See that it fires.
          serverConn.onClose(function () {
            onComplete();
          });
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


testAsyncMulti(
  "livedata server - onConnection doesn't get callback after stop.",
  [function (test, expect) {
    var afterStop = false;
    var expectStop1 = expect();
    var stopHandle1 = Meteor.onConnection(function (conn) {
      stopHandle2.stop();
      stopHandle1.stop();
      afterStop = true;
      // yield to the event loop for a moment to see that no other calls
      // to listener2 are called.
      Meteor.setTimeout(expectStop1, 10);
    });
    var stopHandle2 = Meteor.onConnection(function (conn) {
      test.isFalse(afterStop);
    });

    // trigger a connection
    var expectConnection = expect();
    makeTestConnection(
      test,
      function (clientConn, serverConn) {
        // Close the connection from the client.
        clientConn.disconnect();
        expectConnection();
      },
      expectConnection
    );
  }]
);

Meteor.methods({
  livedata_server_test_inner: function () {
    return this.connection && this.connection.id;
  },

  livedata_server_test_outer: function () {
    return Meteor.call('livedata_server_test_inner');
  },

  livedata_server_test_setuserid: function (userId) {
    this.setUserId(userId);
  }
});


Tinytest.addAsync(
    "livedata server - onMessage hook",
    function (test, onComplete) {

        var cb = Meteor.onMessage(function (msg, session) {
            if (msg.method !== 'livedata_server_test_inner') return;
            test.equal(msg.method, 'livedata_server_test_inner');
            cb.stop();
            onComplete();
        });

        makeTestConnection(
            test,
            function (clientConn, serverConn) {
                clientConn.call('livedata_server_test_inner');
                clientConn.disconnect();
            },
            onComplete
        );
    }
);


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

Meteor.publish("livedata_server_test_sub_method", function (connectionId) {
  var callback = onSubscription[connectionId];
  if (callback) {
    var id = Meteor.call('livedata_server_test_inner');
    callback(id);
  }
  this.stop();
});

Meteor.publish("livedata_server_test_sub_context", function (connectionId, userId) {
  var callback = onSubscription[connectionId];
  var methodInvocation = DDP._CurrentMethodInvocation.get();
  var publicationInvocation = DDP._CurrentPublicationInvocation.get();

  // Check the publish function's environment variables and context.
  if (callback) {
    callback.call(this, methodInvocation, publicationInvocation);
  }

  // Check that onStop callback is have the same context as the publish function
  // and that it runs with the same environment variables as this publish function.
  this.onStop(function () {
    var onStopMethodInvocation = DDP._CurrentMethodInvocation.get();
    var onStopPublicationInvocation = DDP._CurrentPublicationInvocation.get();
    callback.call(this, onStopMethodInvocation, onStopPublicationInvocation, true);
  });

  if (this.userId) {
    this.stop();
  } else {
    this.ready();
    Meteor.call('livedata_server_test_setuserid', userId);
  }
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

Tinytest.addAsync(
  "livedata server - connection in method called from publish function",
  function (test, onComplete) {
    makeTestConnection(
      test,
      function (clientConn, serverConn) {
        onSubscription[serverConn.id] = function (id) {
          delete onSubscription[serverConn.id];
          test.equal(id, serverConn.id);
          clientConn.disconnect();
          onComplete();
        };
        clientConn.subscribe("livedata_server_test_sub_method", serverConn.id);
      }
    );
  }
);

Tinytest.addAsync(
  "livedata server - verify context in publish function",
  function (test, onComplete) {
    makeTestConnection(
      test,
      function (clientConn, serverConn) {
        var userId = 'someUserId';
        onSubscription[serverConn.id] = function (methodInvocation, publicationInvocation, fromOnStop) {
          // DDP._CurrentMethodInvocation should be undefined in a publish function
          test.isUndefined(methodInvocation, 'Should have been undefined');
          // DDP._CurrentPublicationInvocation should be set in a publish function
          test.isNotUndefined(publicationInvocation, 'Should have been defined');
          if (this.userId === userId && fromOnStop) {
            delete onSubscription[serverConn.id];
            clientConn.disconnect();
            onComplete();
          }
        }
        clientConn.subscribe("livedata_server_test_sub_context", serverConn.id, userId);
      }
    );
  }
);

let onSubscriptions = {};

Meteor.publish({
  publicationObject () {
    let callback = onSubscriptions;
    if (callback)
      callback();
    this.stop();
  }
});

Meteor.publish({
  "publication_object": function () {
    let callback = onSubscriptions;
    if (callback)
      callback();
    this.stop();
  }
});

Meteor.publish("publication_compatibility", function () {
  let callback = onSubscriptions;
  if (callback)
    callback();
  this.stop();
});

Tinytest.addAsync(
  "livedata server - publish object",
  function (test, onComplete) {
    makeTestConnection(
      test,
      function (clientConn, serverConn) {
        let testsLength = 0;

        onSubscriptions = function (subscription) {
          delete onSubscriptions;
          clientConn.disconnect();
          testsLength++;
          if(testsLength == 3){
            onComplete();
          }
        };
        clientConn.subscribe("publicationObject");
        clientConn.subscribe("publication_object");
        clientConn.subscribe("publication_compatibility");
      }
    );
  }
);

Meteor.methods({
  testResolvedPromise(arg) {
    const invocation1 = DDP._CurrentMethodInvocation.get();
    return Promise.resolve(arg).then(result => {
      const invocation2 = DDP._CurrentMethodInvocation.get();
      // This equality holds because Promise callbacks are bound to the
      // dynamic environment where .then was called.
      if (invocation1 !== invocation2) {
        throw new Meteor.Error("invocation mismatch");
      }
      return result + " after waiting";
    });
  },

  testRejectedPromise(arg) {
    return Promise.resolve(arg).then(result => {
      throw new Meteor.Error(result + " raised Meteor.Error");
    });
  },

  testRejectedPromiseWithGenericError(arg) {
    return Promise.resolve(arg).then(result => {
      const error = new Error('MESSAGE');
      error.error = 'ERROR';
      error.reason = 'REASON';
      error.details = { foo: 'bar' };
      error.isClientSafe = true;
      throw error;
    });
  }
});

Tinytest.addAsync(
  "livedata server - waiting for Promise",
  (test, onComplete) => makeTestConnection(test, (clientConn, serverConn) => {
    test.equal(
      clientConn.call("testResolvedPromise", "clientConn.call"),
      "clientConn.call after waiting"
    );

    const clientCallPromise = new Promise(
      (resolve, reject) => clientConn.call(
        "testResolvedPromise",
        "clientConn.call with callback",
        (error, result) => error ? reject(error) : resolve(result)
      )
    );

    const serverCallAsyncPromise = Meteor.server.callAsync(
      "testResolvedPromise",
      "Meteor.server.callAsync"
    );

    const serverApplyAsyncPromise = Meteor.server.applyAsync(
      "testResolvedPromise",
      ["Meteor.server.applyAsync"]
    );

    const clientCallRejectedPromise = new Promise(resolve => {
      clientConn.call(
        "testRejectedPromise",
        "with callback",
        (error, result) => resolve(error.message)
      );
    });

    const clientCallRejectedPromiseWithGenericError = new Promise(resolve => {
      clientConn.call(
        "testRejectedPromiseWithGenericError",
        (error, result) => resolve({
          message: error.message,
          error: error.error,
          reason: error.reason,
          details: error.details,
        })
      );
    });

    Promise.all([
      clientCallPromise,
      clientCallRejectedPromise,
      clientCallRejectedPromiseWithGenericError,
      serverCallAsyncPromise,
      serverApplyAsyncPromise
    ]).then(results => test.equal(results, [
      "clientConn.call with callback after waiting",
      "[with callback raised Meteor.Error]",
      {
        message: 'REASON [ERROR]',
        error: 'ERROR',
        reason: 'REASON',
        details: { foo: 'bar' },
      },
      "Meteor.server.callAsync after waiting",
      "Meteor.server.applyAsync after waiting"
    ]), error => test.fail(error))
      .then(onComplete);
  })
);
