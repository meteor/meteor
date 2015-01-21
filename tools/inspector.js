var assert = require("assert");
var net = require("net");
var inspector = require("node-inspector");
var spawn = require("child_process").spawn;
var _ = require("underscore");
var chalk = require("chalk");
var EOL = require("os").EOL;
var Protocol = require("_debugger").Protocol;
var debugEntries = [];

// There can be only one debugger attached to a process at a time, and
// detaching can leave the child process in a weird state for future
// debugging, so the code that attaches to the child process must also
// serve as a proxy for connections from actual debugger clients like
// node-inspector.

// This proxying system requires the child process to be invoked with
// --debug-brk=<port> where <port> is not the same as debugPort, so that
// we can proxy data between <port> and debugPort, as if the child process
// were listening on debugPort (as it did before this commit).

// The first time the server starts, the --debug-brk behavior of pausing
// at the first line of the program is helpful so that the user can set
// breakpoints. When the server restarts, however, that behavior is more
// confusing than helpful, especially since the server can restart
// multiple times in quick succession if the user edits and saves a file
// multiple times. To avoid this confusion, we use the proxy to send a
// continue command to resume execution automatically after restart.

// Itercepting debugger requests, responses, events, etc. has the
// additional benefit of allowing us to print helpful information to the
// console, like notifying the developer that the debugger hit a
// breakpoint, so that there is less confusion when the app is not
// responding to requests.

function start(debugPort, entryPoint) {
  debugPort = +(debugPort || 5858);

  var entry = debugEntries[debugPort];
  if (entry instanceof DebugEntry) {
    return entry.attach;
  }

  debugEntries[debugPort] = entry =
    new DebugEntry(debugPort, entryPoint);

  return entry.attach;
}

function DebugEntry(debugPort, entryPoint) {
  assert.ok(this instanceof DebugEntry);

  this.debugPort = debugPort;
  this.entryPoint = entryPoint;
  this.incomingSink = new BackloggedStreamWriter;
  this.outgoingSink = new BackloggedStreamWriter;
  this.inspectorProcess = null;
  this.interceptServer = null;
  this.debugConnection = null;
  this.connectCount = 0;
  this.attach = this.attach.bind(this);

  // We create a connection to whatever port the child process says it's
  // listening on, so this port is purely advisory.
  this.attach.suggestedDebugBrkPort = debugPort + 101;
}

var DEp = DebugEntry.prototype;

DEp.attach = function attach(child) {
  this.incomingSink.clear();
  this.outgoingSink.clear();

  this.startInterceptServer();
  this.startInspector();
  this.connectToChildProcess(child);
};

// The intercept server listens for connections and data from
// node-inspector (on debugPort) and mediates communication between
// node-inspector and the child process that we're debugging, so that we
// can inject our own commands (e.g. "continue") and print helpful
// information to the console when the debugger hits breakpoints. Note
// that the intercept server survives server restarts, just like
// node-inspector.
DEp.startInterceptServer = function startInterceptServer() {
  var self = this;
  if (self.interceptServer) {
    return;
  }

  self.interceptServer = net.createServer(function(socket) {
    self.outgoingSink.setTarget(socket);
    socket.on("data", function(buffer) {
      self.incomingSink.write(buffer);
    });
  }).on("error", function(err) {
    self.interceptServer = null;
  }).listen(self.debugPort);
};

DEp.startInspector = function startInspector() {
  var self = this;
  if (self.inspectorProcess) {
    return;
  }

  // Port 8080 is the default port that node-inspector uses for its web
  // server, and port 5858 is the default port that node listens on when
  // it receives the --debug or --debug-brk flags. Developers familiar
  // with node-inspector may have http://localhost:8080/debug?port=5858
  // saved in their browser history already, so let's stick with these
  // conventions in the default case (unless of course the developer runs
  // `meteor debug --debug-port <some other port>`).
  var debugPort = self.debugPort;
  var webPort = 8080 + debugPort - 5858;

  var proc = spawn(process.execPath, [
    require.resolve("node-inspector/bin/inspector"),
    "--web-port", "" + webPort,
    "--debug-port", "" + debugPort
  ]);

  proc.url = inspector.buildInspectorUrl("localhost", webPort, debugPort);

  // Forward error output to process.stderr, but silence normal output.
  // proc.stdout.pipe(process.stdout);
  proc.stderr.pipe(process.stderr);

  proc.on("exit", function(code) {
    // Restart the process if it died without us explicitly stopping it.
    if (self.inspectorProcess === proc) {
      self.inspectorProcess = null;
      self.startInspector();
    }
  });

  self.inspectorProcess = proc;
};

DEp.connectToChildProcess = function connectToChildProcess(child) {
  var self = this;

  // Wait for the child process to tell us it's listening on a certain
  // port (not debugPort!), and create a connection to that port so that
  // the child process can communicate with node-inspector.
  child.stderr.on("data", function onData(buffer) {
    var match = /debugger listening on port (\d+)/
      .exec(buffer.toString("utf8"));
    if (match) {
      child.stderr.removeListener("data", onData);
      connect(+match[1]);
    }
  });

  function connect(port) {
    disconnect();

    self.debugConnection = net.createConnection(port);
    self.debugConnection.setEncoding("utf8");
    self.debugConnection.on("data", function(buffer) {
      protocol.execute(buffer);
      self.outgoingSink.write(buffer);
    }).on("error", disconnect);

    var protocol = new Protocol;
    protocol.onResponse = function onResponse(res) {
      // Listen for break events so that we can either skip them or print
      // information to the console about them.
      if (res.body.type === "event" &&
          res.body.event === "break") {
        var scriptName = res.body.body.script.name;
        var lineNumber = res.body.body.sourceLine + 1;

        if (self.connectCount > 1 &&
            scriptName === self.entryPoint) {
          // If we've restarted the server at least once and the break
          // event occurred in the entry point file (typically
          // .meteor/local/build/main.js), send a continue command to skip
          // this breakpoint automatically, so that the user does not have
          // to keep manually continuing the debugger every time the
          // server restarts.
          sendContinue();

        } else {
          // Give some indication in the console that server execution has
          // stopped at a breakpoint.
          process.stdout.write(
            "Paused at " + scriptName + ":" + lineNumber + "\n"
          );
        }
      }
    };

    var sentContinue = false;
    function sendContinue() {
      if (! sentContinue) {
        sentContinue = true;
        self.incomingSink.write(protocol.serialize({
          command: "continue"
        }));
      }
    }

    if (self.connectCount++ === 0) {
      process.stdout.write(banner(self.debugPort));
    } else {
      // Sometimes (for no good reason) the protocol.onResponse handler
      // never receives a break event at the very beginning of the
      // program. This timeout races against that break event to make sure
      // we send exactly one continue command.
      setTimeout(sendContinue, 500);
    }

    self.incomingSink.setTarget(self.debugConnection);
  }

  function disconnect() {
    if (self.debugConnection) {
      self.debugConnection.end();
      self.debugConnection = null;
    }
  }
};

DEp.stop = function stop() {
  var proc = this.inspectorProcess;
  if (proc && proc.kill) {
    this.inspectorProcess = null;
    proc.kill();
  }

  if (this.interceptServer) {
    this.interceptServer.close();
    this.interceptServer = null;
  }

  if (this.debugConnection) {
    this.debugConnection.end();
    this.debugConnection = null;
  }
};

// A simple wrapper object for writable streams that keeps a backlog of
// data written before the stream is available, and writes that data to the
// stream when the stream becomes available.
function BackloggedStreamWriter(target) {
  assert.ok(this instanceof BackloggedStreamWriter);
  this.backlog = [];
  this.target = target || null;
}

var BSWp = BackloggedStreamWriter.prototype;

BSWp.write = function write(buffer) {
  if (this.target) {
    this.target.write(buffer);
  } else {
    this.backlog.push(buffer);
  }
};

BSWp.setTarget = function setTarget(target) {
  if (this.target &&
      this.target !== target) {
    this.clear();
  }

  this.target = target;

  if (target) {
    var clear = this.clear.bind(this);
    target.on("close", clear);
    target.on("end", clear);

    if (this.backlog.length > 0) {
      _.each(this.backlog.splice(0), this.write, this);
    }
  }

  return target;
};

BSWp.clear = function clear() {
  this.backlog.length = 0;
  this.target = null;
};

function banner(debugPort) {
  debugPort = +(debugPort || 5858);
  var entry = debugEntries[debugPort];
  var proc = entry && entry.inspectorProcess;
  assert.strictEqual(typeof proc.url, "string");

  return [
    "",
    chalk.green([
      "Your application is now paused and ready for debugging!",
      "",
      "To debug the server process using a graphical debugging interface, ",
      "visit this URL in your web browser:"
    ].join(EOL)),
    chalk.cyan(proc.url),
    EOL
  ].join(EOL);
}

function stop(debugPort) {
  debugPort = +(debugPort || 5858);
  var entry = debugEntries[debugPort];
  delete debugEntries[debugPort];
  if (entry) {
    entry.stop();
  }
}

require("./cleanup.js").onExit(function killAll() {
  for (var debugPort in debugEntries) {
    stop(debugPort);
  }
  debugEntries.length = 0;
});

exports.start = start;
exports.stop = stop;
