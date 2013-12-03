// Establish a connection from the server to the server, and wait
// until the client side of the connection has received the session
// id.  On success call `succeeded` with two arguments, the client
// side `connection` and the server side `session`.  Call `failed` on
// failure.
makeTestConnection = function (test, succeeded, failed) {
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
    } else {
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
    } else {
      onConnectionHandle.stop();
      succeeded(connection, session);
    }
  };

  // Connect and wait until the connection receives its session id.
  // Disable retries so that when the connection is closed we don't
  // automatically keep reconnecting on the client side.
  connection = DDP.connect(Meteor.absoluteUrl(), {retry: false});
  simplePoll(
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
