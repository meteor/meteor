var assert = require("assert");
var fs = require("fs");
var net = require("net");
var eachline = require("eachline");
var chalk = require("chalk");
var EOL = require("os").EOL;
var server = require("./server/shell-server.js");
var EXITING_MESSAGE = server.EXITING_MESSAGE;
var getInfoFile = server.getInfoFile;

// Invoked by the process running `meteor shell` to attempt to connect to
// the server via the socket file.
exports.connect = function connect(shellDir) {
  new Client(shellDir).connect();
};

function Client(shellDir) {
  var self = this;
  assert.ok(self instanceof Client);

  self.shellDir = shellDir;
  self.exitOnClose = false;
  self.firstTimeConnecting = true;
  self.connected = false;
  self.reconnectCount = 0;
}

var Cp = Client.prototype;

Cp.reconnect = function reconnect(delay) {
  var self = this;

  // Display the "Server unavailable" warning only on the third attempt
  // to reconnect, so it doesn't get shown for successful reconnects.
  if (++self.reconnectCount === 3) {
    console.error(chalk.yellow(
      "Server unavailable (waiting to reconnect)"
    ));
  }

  if (!self.reconnectTimer) {
    self.reconnectTimer = setTimeout(function() {
      delete self.reconnectTimer;
      self.connect();
    }, delay || 100);
  }
};

Cp.connect = function connect() {
  var self = this;
  var infoFile = getInfoFile(self.shellDir);

  fs.readFile(infoFile, "utf8", function(err, json) {
    if (err) {
      return self.reconnect();
    }

    try {
      var info = JSON.parse(json);
    } catch (err) {
      return self.reconnect();
    }

    if (info.status !== "enabled") {
      if (self.firstTimeConnecting) {
        return self.reconnect();
      }

      if (info.reason) {
        console.error(info.reason);
      }

      console.error(EXITING_MESSAGE);
      process.exit(0);
    }

    self.setUpSocket(
      net.connect(info.port, "127.0.0.1"),
      info.key
    );
  });
};

Cp.setUpSocket = function setUpSocket(sock, key) {
  var self = this;
  self.sock = sock;

  // Put STDIN into "flowing mode":
  // http://nodejs.org/api/stream.html#stream_compatibility_with_older_node_versions
  process.stdin.resume();

  function onConnect() {
    self.firstTimeConnecting = false;
    self.reconnectCount = 0;
    self.connected = true;

    // Sending a JSON-stringified options object (even just an empty
    // object) over the socket is required to start the REPL session.
    sock.write(JSON.stringify({
      terminal: ! process.env.EMACS,
      key: key
    }));

    process.stderr.write(shellBanner());
    process.stdin.pipe(sock);
    process.stdin.setRawMode(true);
  }

  function onClose() {
    tearDown();

    // If we received the special EXITING_MESSAGE just before the socket
    // closed, then exit the shell instead of reconnecting.
    if (self.exitOnClose) {
      process.exit(0);
    } else {
      self.reconnect();
    }
  }

  function onError(err) {
    tearDown();
    self.reconnect();
  }

  function tearDown() {
    self.connected = false;
    process.stdin.setRawMode(false);
    process.stdin.unpipe(sock);
    sock.unpipe(process.stdout);
    sock.removeListener("connect", onConnect);
    sock.removeListener("close", onClose);
    sock.removeListener("error", onError);
    sock.end();
  }

  sock.pipe(process.stdout);

  eachline(sock, "utf8", function(line) {
    self.exitOnClose = line.indexOf(EXITING_MESSAGE) >= 0;
  });

  sock.on("connect", onConnect);
  sock.on("close", onClose);
  sock.on("error", onError);
};

function shellBanner() {
  var bannerLines = [
    "",
    "Welcome to the server-side interactive shell!"
  ];

  if (! process.env.EMACS) {
    // Tab completion sadly does not work in Emacs.
    bannerLines.push(
      "",
      "Tab completion is enabled for global variables."
    );
  }

  bannerLines.push(
    "",
    "Type .reload to restart the server and the shell.",
    "Type .exit to disconnect from the server and leave the shell.",
    "Type .help for additional help.",
    EOL
  );

  return chalk.green(bannerLines.join(EOL));
}
