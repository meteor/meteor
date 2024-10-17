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
            return !clientConn.status().connected;
          },
          onComplete,
          function () {
            test.fail(
              "timeout waiting for the connection to be closed on the server side"
            );
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
  [
    function (test, expect) {
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
    },
  ]
);

Meteor.methods({
  livedata_server_test_inner: function () {
    return this.connection && this.connection.id;
  },

  livedata_server_test_outer: async function () {
    return await Meteor.callAsync("livedata_server_test_inner");
  },

  livedata_server_test_setuserid: function (userId) {
    this.setUserId(userId);
  },
});

Tinytest.addAsync(
  "livedata server - onMessage hook",
  function (test, onComplete) {
    var cb = Meteor.onMessage(function (msg, session) {
      if (msg.method !== 'livedata_server_test_inner') return;
            test.equal(msg.method, "livedata_server_test_inner");
      cb.stop();
      onComplete();
    });

    makeTestConnection(
      test,
      function (clientConn, serverConn) {
        clientConn
          .callAsync("livedata_server_test_inner")
          .then(() => clientConn.disconnect())
          .catch((e) => {
            onComplete();
            throw new Meteor.Error(e);
          });
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
        clientConn.callAsync("livedata_server_test_inner").then(async (res) => {
          const r = res;
          test.equal(r, serverConn.id);
          clientConn.disconnect();
          onComplete();
        });
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
        clientConn.callAsync("livedata_server_test_outer").then(async (res) => {
          const r = res;
          test.equal(r, serverConn.id);
          clientConn.disconnect();
          onComplete();
        });
      },
      onComplete
    );
  }
);

// connectionId -> callback
var onSubscription = {};

Meteor.publish("livedata_server_test_sub", function (connectionId) {
  var callback = onSubscription[connectionId];
  if (callback) callback(this);
  this.stop();
});

Meteor.publish(
  "livedata_server_test_sub_method",
  async function (connectionId) {
    var callback = onSubscription[connectionId];
    if (callback) {
      var id = await Meteor.callAsync("livedata_server_test_inner");
      callback(id);
    }
    this.stop();
  }
);

Meteor.publish(
  "livedata_server_test_sub_context",
  async function (connectionId, userId) {
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
      callback.call(
        this,
        onStopMethodInvocation,
        onStopPublicationInvocation,
        true
      );
    });

    if (this.userId) {
      this.stop();
    } else {
      this.ready();
      await Meteor.callAsync("livedata_server_test_setuserid", userId);
    }
  }
);

Tinytest.addAsync(
  "livedata server - connection in publish function",
  function (test, onComplete) {
    makeTestConnection(test, function (clientConn, serverConn) {
      onSubscription[serverConn.id] = function (subscription) {
        delete onSubscription[serverConn.id];
        test.equal(subscription.connection.id, serverConn.id);
        clientConn.disconnect();
        onComplete();
      };
      clientConn.subscribe("livedata_server_test_sub", serverConn.id);
    });
  }
);

Tinytest.addAsync(
  "livedata server - connection in method called from publish function",
  function (test, onComplete) {
    makeTestConnection(test, function (clientConn, serverConn) {
      onSubscription[serverConn.id] = function (id) {
        delete onSubscription[serverConn.id];
        test.equal(id, serverConn.id);
        clientConn.disconnect();
        onComplete();
      };
      clientConn.subscribe("livedata_server_test_sub_method", serverConn.id);
    });
  }
);

Tinytest.addAsync(
  "livedata server - verify context in publish function",
  function (test, onComplete) {
    makeTestConnection(test, function (clientConn, serverConn) {
      var userId = "someUserId";
      onSubscription[serverConn.id] = function (
        methodInvocation,
        publicationInvocation,
        fromOnStop
      ) {
        // DDP._CurrentMethodInvocation should be undefined in a publish function
        test.isUndefined(methodInvocation, "Should have been undefined");
        // DDP._CurrentPublicationInvocation should be set in a publish function
        test.isNotUndefined(publicationInvocation, "Should have been defined");
        if (this.userId === userId && fromOnStop) {
          delete onSubscription[serverConn.id];
          clientConn.disconnect();
          onComplete();
        }
      };
      clientConn.subscribe(
        "livedata_server_test_sub_context",
        serverConn.id,
        userId
      );
    });
  }
);

let onSubscriptions = {};

Meteor.publish({
  publicationObject() {
    let callback = onSubscriptions;
    if (callback) callback();
    this.stop();
  },
});

Meteor.publish({
  publication_object: function () {
    let callback = onSubscriptions;
    if (callback) callback();
    this.stop();
  },
});

Meteor.publish("publication_compatibility", function () {
  let callback = onSubscriptions;
  if (callback) callback();
  this.stop();
});

Tinytest.addAsync(
  "livedata server - publish object",
  function (test, onComplete) {
    makeTestConnection(test, function (clientConn, serverConn) {
      let testsLength = 0;

      onSubscriptions = function (subscription) {
        clientConn.disconnect();
        testsLength++;
        if (testsLength == 3) {
          onComplete();
        }
      };
      clientConn.subscribe("publicationObject");
      clientConn.subscribe("publication_object");
      clientConn.subscribe("publication_compatibility");
    });
  }
);

Meteor.methods({
  async testResolvedPromise(arg) {
    const invocationRunningFromCallAsync1 =
      DDP._CurrentMethodInvocation._isCallAsyncMethodRunning();
    return Promise.resolve(arg).then((result) => {
      const invocationRunningFromCallAsync2 =
        DDP._CurrentMethodInvocation._isCallAsyncMethodRunning();
      // What matters here is that both invocations are coming from the same call,
      // so both of them can be considered a simulation.
      if (invocationRunningFromCallAsync1 !== invocationRunningFromCallAsync2) {
        throw new Meteor.Error("invocation mismatch");
      }
      return result + " after waiting";
    });
  },

  testRejectedPromise(arg) {
    return Promise.resolve(arg).then((result) => {
      throw new Meteor.Error(result + " raised Meteor.Error");
    });
  },

  testRejectedPromiseWithGenericError(arg) {
    return Promise.resolve(arg).then((result) => {
      const error = new Error("MESSAGE");
      error.error = "ERROR";
      error.reason = "REASON";
      error.details = { foo: "bar" };
      error.isClientSafe = true;
      throw error;
    });
  },
});

Meteor.publish("livedata_server_test_sub_chain", async function () {
  await new Promise((r) => setTimeout(r, 2000));
  this.ready();
  return null;
});

Tinytest.addAsync(
  "livedata server - waiting for subscription chain",
  (test, onComplete) =>
    makeTestConnection(test, async (clientConn, serverConn) => {
      const handlers = [];
      for (let i = 0; i < 10; i++) {
        handlers.push(clientConn.subscribe("livedata_server_test_sub_chain"));
      }
      await new Promise((r) => setTimeout(r, 3000));
      test.equal(
        handlers.map((sub) => sub.ready()).filter((o) => o).length === 1,
        true
      );
      onComplete();
    })
);
Tinytest.addAsync("livedata server - waiting for Promise", (test, onComplete) =>
  makeTestConnection(test, async (clientConn, serverConn) => {
    const testResolvedPromiseResult = await clientConn.callAsync(
      "testResolvedPromise",
      "clientConn.call"
    );
    test.equal(testResolvedPromiseResult, "clientConn.call after waiting");

    const clientCallPromise = new Promise((resolve, reject) =>
      clientConn.call(
        "testResolvedPromise",
        "clientConn.call with callback",
        (error, result) => (error ? reject(error) : resolve(result))
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

    const clientCallRejectedPromise = new Promise((resolve) => {
      clientConn.call("testRejectedPromise", "with callback", (error, result) =>
        resolve(error.message)
      );
    });

    const clientCallRejectedPromiseWithGenericError = new Promise((resolve) => {
      clientConn.call("testRejectedPromiseWithGenericError", (error, result) =>
        resolve({
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
      serverApplyAsyncPromise,
    ])
      .then(
        (results) =>
          test.equal(results, [
            "clientConn.call with callback after waiting",
            "[with callback raised Meteor.Error]",
            {
              message: "REASON [ERROR]",
              error: "ERROR",
              reason: "REASON",
              details: { foo: "bar" },
            },
            "Meteor.server.callAsync after waiting",
            "Meteor.server.applyAsync after waiting",
          ]),
        (error) => test.fail(error)
      )
      .then(onComplete);
  })
);

/**
 * https://github.com/meteor/meteor/issues/13212
 */
Tinytest.addAsync('livedata server - publish cursor is properly awaited', async function (test) {
  let sub = null;

  const { conn, messages, cleanup } = await captureConnectionMessages(test);

  const coll = new Mongo.Collection('items', {
    defineMutationMethods: false,
  });

  for (let i = 0; i < 10; i++) {
    await coll.removeAsync({ _id: `item_${i}` })
    await coll.insertAsync({ _id: `item_${i}`, title: `Item #${i}` });
  }

  const publicationName = `publication_${Random.id()}`

  delete Meteor.server.publish_handlers[publicationName];

  Meteor.publish(publicationName, async function (count) {
    return coll.find({}, { limit: count });
  });

  const reactiveVar = new ReactiveVar(1);

  const computation = Tracker.autorun(() => {
    sub = conn.subscribe(publicationName, reactiveVar.get());
  });

  await Meteor._sleepForMs(100);

  reactiveVar.set(2);

  await Meteor._sleepForMs(100);

  const expectedMessages = ['sub', 'added', 'ready', 'sub', 'unsub', 'added', 'ready', 'nosub']

  /**
   * There shouldn't ever be `removed` messages here, otherwise the UI will glitch
   */
  const parsedMessages = messages.map(m => m.msg)

  test.equal(parsedMessages, expectedMessages)

  computation.stop();

  cleanup()
});

function getTestConnections(test) {
  return new Promise((resolve, reject) => {
    makeTestConnection(test, (clientConn, serverConn) => {
      resolve({ clientConn, serverConn });
    }, reject);
  })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}