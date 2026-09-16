// Helper to temporarily set disconnectGracePeriod for DDP resumption tests
// This ensures test isolation - other tests run with the default grace period
const DEFAULT_GRACE_PERIOD = Meteor.server.options.disconnectGracePeriod;
const TEST_GRACE_PERIOD = 5000; // Short grace period for fast tests (ms)
// Derived timing constants to avoid hardcoding throughout tests
const WITHIN_GRACE_PERIOD_MS = Math.floor(TEST_GRACE_PERIOD / 4); // Well within grace period
const AFTER_GRACE_PERIOD_MS = Math.ceil(TEST_GRACE_PERIOD * 1.5); // After grace period expires
const POLL_TIMEOUT_MS = TEST_GRACE_PERIOD * 2; // Max time to wait for async operations before failing

async function withTestGracePeriod(fn) {
  const previous = Meteor.server.options.disconnectGracePeriod;
  Meteor.server.options.disconnectGracePeriod = TEST_GRACE_PERIOD;
  try {
    await fn();
  } finally {
    Meteor.server.options.disconnectGracePeriod = previous ?? DEFAULT_GRACE_PERIOD;
  }
}

// Helper to poll for a condition with timeout to prevent hanging tests
function pollUntil(conditionFn, timeoutMs = POLL_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (conditionFn()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval);
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for condition`));
      }
    }, 10);
  });
}

function trackOnConnectionCalls() {
  const callsBySessionId = new Map();
  const handle = Meteor.onConnection(({ id }) => {
    callsBySessionId.set(id, (callsBySessionId.get(id) || 0) + 1);
  });

  return {
    callsBySessionId,
    stop() {
      handle.stop();
    },
  };
}

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

Tinytest.addAsync('livedata server - stopping a handle should preserve its context on callbacks', async function (test) {
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

  Meteor.publish(publicationName, async function () {
    const user = {
      _id: 'user_id',
      customer: 'customer_id',
    }

    if (user) {
      let count = 0;

      let initializing = true;
      const handle = await coll.find({}).observeChangesAsync({
        added: () => {
          count += 1;
          if (!initializing) this.changed('issueUnreadCount', user._id, { count });
        },
        removed: () => {
          count -= 1;
          this.changed('issueUnreadCount', user._id, { count });
        }
      });

      initializing = false;

      this.added('issueUnreadCount', user._id, { count });

      // Should be the same as `this.onStop(() => handle.stop())`
      this.onStop(handle.stop);

      this.onStop(() => {
        // If stop is called and breaks for some reason, this will be false
        test.isTrue(handle._stopped)
      })

      this.ready();
    }
  });

  // Create multiple competing subscriptions
  const sub1 = conn.subscribe(publicationName);
  const sub2 = conn.subscribe(publicationName);
  const sub3 = conn.subscribe(publicationName);

  // Make changes that will affect all subs
  await coll.insertAsync({ _id: 'item_10', title: 'Item #10' });

  // Stop middle subscription during changes
  sub2.stop();

  await coll.insertAsync({ _id: 'item_11', title: 'Item #11' });

  // Create new subscription while changes happening
  const sub4 = conn.subscribe(publicationName);

  await coll.removeAsync({ _id: 'item_10' });

  sub1.stop();

  await coll.insertAsync({ _id: 'item_12', title: 'Item #12' });

  // Final subscription during teardown of others
  const sub5 = conn.subscribe(publicationName);

  sub3.stop();
  sub4.stop();

  await sleep(50);

  sub5.stop();

  await sleep(50);

  cleanup();
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

// ============================================================================
// DDP Session Resumption Tests
// ============================================================================

// Test that unexpected disconnects allow session resumption within grace period
Tinytest.addAsync(
  "livedata server - DDP resumption: unexpected disconnect preserves session",
  async function (test) {
    await withTestGracePeriod(async () => {
      const { clientConn, serverConn } = await getTestConnections(test);
      const originalSessionId = serverConn.id;

      // Verify the session exists
      test.isTrue(Meteor.server.sessions.has(originalSessionId));

      // Simulate unexpected disconnect by forcing the stream to close
      // without sending a disconnect message
      clientConn._stream._lostConnection();

      // Wait a bit but less than the grace period
      await sleep(WITHIN_GRACE_PERIOD_MS);

      // Session should still exist during grace period
      test.isTrue(
        Meteor.server.sessions.has(originalSessionId),
        "Session should be preserved during grace period"
      );

      // Wait for grace period to expire
      await sleep(AFTER_GRACE_PERIOD_MS);

      // Session should be removed after grace period
      test.isFalse(
        Meteor.server.sessions.has(originalSessionId),
        "Session should be removed after grace period expires"
      );
    });
  }
);

// Test that graceful disconnects (client sends disconnect message) remove session immediately
Tinytest.addAsync(
  "livedata server - DDP resumption: graceful disconnect removes session immediately",
  async function (test) {
    await withTestGracePeriod(async () => {
      const { clientConn, serverConn } = await getTestConnections(test);
      const originalSessionId = serverConn.id;

      // Verify the session exists
      test.isTrue(Meteor.server.sessions.has(originalSessionId));

      // Graceful disconnect - this sends the disconnect message
      clientConn.disconnect();

      // Wait a moment for the disconnect to process
      await sleep(WITHIN_GRACE_PERIOD_MS);

      // Session should be removed immediately (not waiting for grace period)
      test.isFalse(
        Meteor.server.sessions.has(originalSessionId),
        "Session should be removed immediately after graceful disconnect"
      );
    });
  }
);

// Test that server-initiated close removes session immediately (not resumable)
Tinytest.addAsync(
  "livedata server - DDP resumption: server-initiated close removes session immediately",
  async function (test) {
    await withTestGracePeriod(async () => {
      const { serverConn } = await getTestConnections(test);
      const originalSessionId = serverConn.id;

      // Verify the session exists
      test.isTrue(Meteor.server.sessions.has(originalSessionId));

      // Server-initiated close via connectionHandle.close()
      serverConn.close();

      // Wait a moment for the close to process
      await sleep(WITHIN_GRACE_PERIOD_MS);

      // Session should be removed immediately (server kicks should not be resumable)
      test.isFalse(
        Meteor.server.sessions.has(originalSessionId),
        "Session should be removed immediately after server-initiated close"
      );
    });
  }
);

// Test that onConnection hook is NOT called on session resume
Tinytest.addAsync(
  "livedata server - DDP resumption: onConnection not called on resume",
  async function (test) {
    await withTestGracePeriod(async () => {
      const connectionCalls = trackOnConnectionCalls();

      // Create initial connection
      const clientConn = DDP.connect(Meteor.absoluteUrl(), { retry: false });

      try {
        // Wait for this connection's session and onConnection callback.
        await pollUntil(() =>
          clientConn._lastSessionId &&
          connectionCalls.callsBySessionId.has(clientConn._lastSessionId)
        );

        const originalSessionId = clientConn._lastSessionId;
        test.equal(
          connectionCalls.callsBySessionId.get(originalSessionId),
          1,
          "onConnection should be called once on initial connect"
        );

        // Get the server session and verify it exists
        const serverSession = Meteor.server.sessions.get(originalSessionId);
        test.isTrue(serverSession, "Server session should exist");

        // Simulate unexpected disconnect
        clientConn._stream._lostConnection();

        // Wait a bit (less than grace period)
        await sleep(WITHIN_GRACE_PERIOD_MS);

        // Session should still exist
        test.isTrue(
          Meteor.server.sessions.has(originalSessionId),
          "Session should still exist during grace period"
        );

        // Reconnect - this should resume the session
        clientConn._stream.reconnect();

        // A completed method round trip proves that the resumed session is
        // active on both sides, without relying on client status timing.
        const resumedSessionId = await clientConn.callAsync(
          "livedata_server_test_inner"
        );

        // IMPORTANT: Assert that session was actually resumed (same session ID)
        // If this fails, the test is not actually testing resumption
        test.equal(
          resumedSessionId,
          originalSessionId,
          "Session should be resumed with same session ID"
        );

        // onConnection should NOT have been called again for the resumed session.
        test.equal(
          connectionCalls.callsBySessionId.get(originalSessionId),
          1,
          "onConnection should not be called again on session resume"
        );
      } finally {
        connectionCalls.stop();
        clientConn.disconnect();
      }
    });
  }
);

// Test that server-initiated close prevents session resumption
Tinytest.addAsync(
  "livedata server - DDP resumption: server close prevents resumption",
  async function (test) {
    await withTestGracePeriod(async () => {
      const connectionCalls = trackOnConnectionCalls();

      // Create initial connection
      const clientConn = DDP.connect(Meteor.absoluteUrl(), { retry: true });

      try {
        // Wait for this connection's session and onConnection callback.
        await pollUntil(() =>
          clientConn._lastSessionId &&
          connectionCalls.callsBySessionId.has(clientConn._lastSessionId)
        );

        const originalSessionId = clientConn._lastSessionId;
        test.equal(
          connectionCalls.callsBySessionId.get(originalSessionId),
          1,
          "onConnection should be called once on initial connect"
        );

        // Get the server session
        const serverSession = Meteor.server.sessions.get(originalSessionId);
        test.isTrue(serverSession, "Server session should exist");

        // Server-initiated close (kick the client)
        serverSession.connectionHandle.close();

        // Wait for the replacement session's onConnection callback.
        await pollUntil(() =>
          clientConn._lastSessionId !== originalSessionId &&
          connectionCalls.callsBySessionId.has(clientConn._lastSessionId)
        );

        const replacementSessionId = clientConn._lastSessionId;
        test.notEqual(
          replacementSessionId,
          originalSessionId,
          "Should have a new session ID after server-initiated close"
        );
        test.equal(
          connectionCalls.callsBySessionId.get(replacementSessionId),
          1,
          "onConnection should be called for the replacement session"
        );
      } finally {
        connectionCalls.stop();
        clientConn.disconnect();
      }
    });
  }
);

// Test that graceful client disconnect prevents session resumption
Tinytest.addAsync(
  "livedata server - DDP resumption: graceful disconnect prevents resumption",
  async function (test) {
    await withTestGracePeriod(async () => {
      const connectionCalls = trackOnConnectionCalls();

      // Create initial connection with retry enabled
      const clientConn = DDP.connect(Meteor.absoluteUrl(), { retry: true });

      try {
        // Wait for this connection's session and onConnection callback.
        await pollUntil(() =>
          clientConn._lastSessionId &&
          connectionCalls.callsBySessionId.has(clientConn._lastSessionId)
        );

        const originalSessionId = clientConn._lastSessionId;
        test.equal(
          connectionCalls.callsBySessionId.get(originalSessionId),
          1,
          "onConnection should be called once on initial connect"
        );

        // Graceful disconnect (sends disconnect message)
        clientConn.disconnect();

        // Wait for session to be removed
        await sleep(WITHIN_GRACE_PERIOD_MS);

        // Session should be removed immediately
        test.isFalse(
          Meteor.server.sessions.has(originalSessionId),
          "Session should be removed after graceful disconnect"
        );

        // Reconnect
        clientConn.reconnect();

        // Wait for the replacement session's onConnection callback.
        await pollUntil(() =>
          clientConn._lastSessionId !== originalSessionId &&
          connectionCalls.callsBySessionId.has(clientConn._lastSessionId)
        );

        const replacementSessionId = clientConn._lastSessionId;
        test.notEqual(
          replacementSessionId,
          originalSessionId,
          "Should have a new session ID after graceful disconnect and reconnect"
        );
        test.equal(
          connectionCalls.callsBySessionId.get(replacementSessionId),
          1,
          "onConnection should be called for the replacement session"
        );
      } finally {
        connectionCalls.stop();
        clientConn.disconnect();
      }
    });
  }
);

// Test that receivedCount mismatch causes new session (not resume)
Tinytest.addAsync(
  "livedata server - DDP resumption: count mismatch creates new session",
  async function (test) {
    await withTestGracePeriod(async () => {
      const connectionCalls = trackOnConnectionCalls();

      // Create initial connection
      const clientConn = DDP.connect(Meteor.absoluteUrl(), { retry: false });

      try {
        // Wait for this connection's session and onConnection callback.
        await pollUntil(() =>
          clientConn._lastSessionId &&
          connectionCalls.callsBySessionId.has(clientConn._lastSessionId)
        );

        const originalSessionId = clientConn._lastSessionId;
        test.equal(
          connectionCalls.callsBySessionId.get(originalSessionId),
          1,
          "onConnection should be called once on initial connect"
        );

        // Get the server session
        const serverSession = Meteor.server.sessions.get(originalSessionId);
        test.isTrue(serverSession, "Server session should exist");

        // Artificially increment sentCount to create a mismatch
        // This simulates messages sent by server that client didn't receive
        serverSession.sentCount += 5;

        // Simulate unexpected disconnect
        clientConn._stream._lostConnection();

        // Wait a bit (less than grace period)
        await sleep(WITHIN_GRACE_PERIOD_MS);

        // Session should still exist during grace period
        test.isTrue(
          Meteor.server.sessions.has(originalSessionId),
          "Session should still exist during grace period"
        );

        // Reconnect - this should NOT resume due to count mismatch
        clientConn._stream.reconnect();

        // Wait for the replacement session's onConnection callback.
        await pollUntil(() =>
          clientConn._lastSessionId !== originalSessionId &&
          connectionCalls.callsBySessionId.has(clientConn._lastSessionId)
        );

        const replacementSessionId = clientConn._lastSessionId;
        test.notEqual(
          replacementSessionId,
          originalSessionId,
          "Should have a new session ID when counts mismatch"
        );
        test.equal(
          connectionCalls.callsBySessionId.get(replacementSessionId),
          1,
          "onConnection should be called for the replacement session"
        );
      } finally {
        connectionCalls.stop();
        clientConn.disconnect();
      }
    });
  }
);

// Test that send() on a removed session is a safe no-op
Tinytest.addAsync(
  "livedata server - DDP resumption: send after session removal is a no-op",
  async function (test) {
    await withTestGracePeriod(async () => {
      const { clientConn, serverConn } = await getTestConnections(test);
      const session = Meteor.server.sessions.get(serverConn.id);

      // Unexpected disconnect: session enters its grace period and buffers.
      clientConn._stream._lostConnection();
      await sleep(WITHIN_GRACE_PERIOD_MS);
      test.isTrue(
        Array.isArray(session.messageQueue),
        "session should buffer messages during the grace period"
      );

      // Let the grace period expire — the session is removed.
      await sleep(AFTER_GRACE_PERIOD_MS);
      test.isFalse(Meteor.server.sessions.has(serverConn.id));

      // The buffer must be gone, and a late send (e.g. a deferred
      // write-fence callback) must not buffer toward an overflow that
      // would invoke the nulled _pendingRemoveFunction and throw.
      test.isNull(session.messageQueue);
      session.send({ msg: 'added', collection: 'x', id: '1', fields: {} });
      test.isNull(session.messageQueue);
    });
  }
);

// Test that a server-initiated close during the grace period removes the
// session immediately instead of silently doing nothing
Tinytest.addAsync(
  "livedata server - DDP resumption: connection close during grace period removes session",
  async function (test) {
    await withTestGracePeriod(async () => {
      const { clientConn, serverConn } = await getTestConnections(test);
      const sessionId = serverConn.id;
      const session = Meteor.server.sessions.get(sessionId);

      // Unexpected disconnect: session enters its grace period.
      clientConn._stream._lostConnection();
      await sleep(WITHIN_GRACE_PERIOD_MS);
      test.isTrue(
        Meteor.server.sessions.has(sessionId),
        "session should be in its grace period"
      );

      // Server explicitly closes the connection: the session must not
      // remain resumable.
      session.connectionHandle.close();
      test.isFalse(
        Meteor.server.sessions.has(sessionId),
        "server-initiated close should remove the session immediately"
      );
    });
  }
);

// Test that messages buffered during the grace period are delivered on
// resume, and that the resumed session gets a fresh grace period later
Tinytest.addAsync(
  "livedata server - DDP resumption: grace-period messages delivered on resume",
  async function (test) {
    await withTestGracePeriod(async () => {
      const clientConn = DDP.connect(Meteor.absoluteUrl(), { retry: false });
      await pollUntil(() => clientConn._lastSessionId);
      const sessionId = clientConn._lastSessionId;
      const session = Meteor.server.sessions.get(sessionId);

      // Record raw messages arriving on the client stream.
      const received = [];
      clientConn._stream.on('message', raw => received.push(raw));

      // Unexpected disconnect, then buffer a message during the grace period.
      clientConn._stream._lostConnection();
      await sleep(WITHIN_GRACE_PERIOD_MS);
      session.send({
        msg: 'added', collection: 'resume-order', id: 'q1', fields: {}
      });
      test.isTrue(Array.isArray(session.messageQueue));

      // Resume.
      clientConn._stream.reconnect();
      await pollUntil(() => clientConn.status().connected);
      await sleep(WITHIN_GRACE_PERIOD_MS);
      test.equal(clientConn._lastSessionId, sessionId,
        "session should have been resumed");

      // The buffered message reached the client...
      test.isTrue(
        received.some(raw => raw.indexOf('"q1"') !== -1),
        "message buffered during the grace period should be delivered on resume"
      );
      // ...the queue is detached...
      test.isUndefined(session.messageQueue);
      // ...and no stale flag denies the session its next grace period.
      test.isFalse(!!session._expectingDisconnect);

      clientConn.disconnect();
    });
  }
);

// ============================================================================
// Async onStop cleanup tests (memory leak fix)
// ============================================================================

const asyncCleanupTracker = {};

Meteor.publish('test_async_onstop_cleanup', function (trackerId) {
  this.onStop(async function () {
    await new Promise(resolve => setTimeout(resolve, 50));
    asyncCleanupTracker[trackerId] = true;
  });
  this.ready();
});

Tinytest.addAsync(
  'livedata server - async onStop callbacks complete on unsubscribe',
  async function (test) {
    const trackerId = Random.id();
    asyncCleanupTracker[trackerId] = false;

    const { clientConn } = await getTestConnections(test);
    const sub = clientConn.subscribe('test_async_onstop_cleanup', trackerId);

    await waitUntil(
      () => sub.ready(),
      { description: 'subscription is ready' }
    );

    sub.stop();

    await waitUntil(
      () => asyncCleanupTracker[trackerId] === true,
      { description: 'async onStop callback completed after unsubscribe' }
    );

    test.isTrue(
      asyncCleanupTracker[trackerId],
      'Async onStop callback should have completed'
    );

    clientConn.disconnect();
    delete asyncCleanupTracker[trackerId];
  }
);

Tinytest.addAsync(
  'livedata server - async onStop callbacks complete on disconnect',
  async function (test) {
    const trackerId = Random.id();
    asyncCleanupTracker[trackerId] = false;

    const { clientConn } = await getTestConnections(test);
    clientConn.subscribe('test_async_onstop_cleanup', trackerId);

    await waitUntil(
      () => clientConn.status().connected,
      { description: 'client is connected' }
    );

    clientConn.disconnect();

    await waitUntil(
      () => asyncCleanupTracker[trackerId] === true,
      { description: 'async onStop callback completed after disconnect' }
    );

    test.isTrue(
      asyncCleanupTracker[trackerId],
      'Async onStop callback should have completed on disconnect'
    );

    delete asyncCleanupTracker[trackerId];
  }
);
// A crossbar listen handle's stop() must be idempotent. A second stop()
// used to decrement the listener count again, silently deleting the
// collection's remaining listeners once it hit zero (and throwing on any
// later stop). Observer teardown races make double-stop plausible.
Tinytest.addAsync(
  "livedata server - crossbar listen handle stop is idempotent",
  async function (test) {
    const crossbar = new DDPServer._Crossbar({});
    let fired = 0;
    const handleA = crossbar.listen(
      { collection: 'crossbar-idempotent-stop' },
      function () {}
    );
    const handleB = crossbar.listen(
      { collection: 'crossbar-idempotent-stop' },
      function () {
        fired++;
      }
    );

    handleA.stop();
    handleA.stop(); // no-op, must not disturb other listeners

    await crossbar.fire({ collection: 'crossbar-idempotent-stop', id: 'x' });
    test.equal(fired, 1);

    handleB.stop(); // must not throw
  }
);

// added() lazily creates the per-collection accounting Set; removed() read it
// unguarded. Publication strategies can change per collection at runtime, so
// an add under a no-accounting strategy followed by a remove under an
// accounting one threw a TypeError out of the publish handler.
Meteor.publish('livedata_server_test_strategy_flip', function () {
  const collection = 'strategy-flip-collection';
  Meteor.server.setPublicationStrategy(
    collection,
    DDPServer.publicationStrategies.NO_MERGE_NO_HISTORY
  );
  try {
    this.added(collection, 'doc1', { a: 1 });
    Meteor.server.setPublicationStrategy(
      collection,
      DDPServer.publicationStrategies.SERVER_MERGE
    );
    this.removed(collection, 'doc1');
  } finally {
    // Fully restore global state: remove the per-collection override rather
    // than leaving an explicit (if default-equivalent) entry behind.
    delete Meteor.server._publicationStrategies[collection];
  }
  this.ready();
});

Tinytest.addAsync(
  "livedata server - removed() after publication strategy change does not throw",
  async function (test) {
    const { clientConn } = await getTestConnections(test);
    try {
      await new Promise((resolve, reject) => {
        clientConn.subscribe('livedata_server_test_strategy_flip', {
          onReady: resolve,
          onError: reject,
        });
      });
      test.isTrue(true, 'subscription became ready without a handler error');
    } finally {
      clientConn.disconnect();
    }
  }
);
