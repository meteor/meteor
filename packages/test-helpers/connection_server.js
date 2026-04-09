// Establish a connection from the server to the server, and wait
// until the client side of the connection has received the session
// id.  On success call `succeeded` with two arguments, the client
// side connection and the server side connection handle.  Call `failed` on
// failure.
makeTestConnection = function (test, succeeded, failed) {
  // Track incoming connections server side until we know which one is
  // ours.
  const serverConns = {};

  // Add incoming connections to `serverConns`.
  const onConnectionHandle = Meteor.onConnection(function (serverConn) {
    test.isTrue(typeof serverConn.id === "string", "connection handle id exists and is a string");
    if (serverConns[serverConn.id]) {
      test.fail("onConnection callback called multiple times for same session id");
      failed();
    } else {
      serverConns[serverConn.id] = serverConn;
    }
  });

  // Connect and wait until the connection receives its session id.
  // Disable retries so that when the connection is closed we don't
  // automatically keep reconnecting on the client side.
  // The connection from the client side.
  const clientConn = DDP.connect(Meteor.absoluteUrl(), { retry: false });

  // We've succeeded when we get the session id on the client side.
  const onClientSessionId = function (sessionId) {
    test.isTrue(clientConn.status().connected);
    const serverConn = serverConns[sessionId];
    if (!serverConn) {
      test.fail("No onConnection received server side for connected client");
      failed();
    } else {
      onConnectionHandle.stop();
      succeeded(clientConn, serverConn);
    }
  };
  simplePoll(
    function () {
      return clientConn._lastSessionId;
    },
    function () {
      onClientSessionId(clientConn._lastSessionId);
    },
    function () {
      test.fail("client side of connection did not receive a session id");
      failed();
    },
  );
};

createTestConnectionPromise = function (test) {
  return new Promise((resolve, reject) => {
    makeTestConnection(test, resolve, reject);
  });
};

captureConnectionMessages = async function (test) {
  const messages = [];

  const conn = await createTestConnectionPromise(test);

  const send = conn._stream.send;

  conn._stream.send = function (...args) {
    send.apply(this, args);
    messages.push(EJSON.parse(args[0]));
  };

  conn._stream.on("message", (message) => messages.push(EJSON.parse(message)));

  function cleanup() {
    conn._stream.send = send;
  }

  return {
    conn,
    messages,
    cleanup,
  };
};
