var Fiber = Npm.require("fibers");
var Future = Npm.require("fibers/future");

// XXX Deps isn't supported on the server... but we need a way to
// capture client connection status transitions.

var waitReactive = function (fn) {
  var future = new Future();
  var timeoutHandle = Meteor.setTimeout(
    function () {
      future.throw(new Error("timeout"));
    },
    60000
  );
  Deps.autorun(function (c) {
    var ret = fn();
    if (ret) {
      c.stop();
      Meteor.clearTimeout(timeoutHandle);

      // We need to run in a fiber for `defer`.
      Fiber(function () {
        // Use `defer` because yields are blocked inside of autorun.
        Meteor.defer(function () {
          future.return(ret);
        })
      }).run();
    }
  });
  return future.wait();
};

var waitForClientConnectionStatus = function (connection, status) {
  waitReactive(function () {
    return connection.status().status === status;
  });
};

// Override the server heartbeat for an incoming connection.

var serverOverride = {};

Meteor.onConnection(function (serverConnection) {
  _.extend(serverConnection._internal, serverOverride);
});


// Expect to connect, and then to reconnect (presumably because of a
// timeout).

var expectConnectAndReconnect = function (clientConnection) {
  console.log(". client is connecting");
  waitForClientConnectionStatus(clientConnection, "connected");

  console.log(". client is connected, expecting ping timeout and reconnect");
  waitForClientConnectionStatus(clientConnection, "connecting");

  console.log(". client is reconnecting");
};


var testClientTimeout = function () {
  console.log("Test client timeout");

  serverOverride = {
    _disableHeartbeat: true
  };

  var clientConnection = DDP.connect(Meteor.absoluteUrl());

  expectConnectAndReconnect(clientConnection);

  clientConnection.close();
  console.log("test successful\n");
};


var testServerTimeout = function () {
  console.log("Test server timeout");

  serverOverride = {};

  var clientConnection = DDP.connect(Meteor.absoluteUrl());
  clientConnection._disableHeartbeat = true;

  expectConnectAndReconnect(clientConnection);

  clientConnection.close();
  console.log("test successful\n");
};

Fiber(function () {
  testClientTimeout();
  testServerTimeout();
  process.exit(0);
}).run();
