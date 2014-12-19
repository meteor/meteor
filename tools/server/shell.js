var assert = require("assert");
var path = require("path");
var stream = require("stream");
var fs = require("fs");
var net = require("net");
var tty = require("tty");
var vm = require("vm");
var Fiber = require("fibers");
var eachline = require("eachline");
var chalk = require("chalk");
var EOL = require("os").EOL;
var _ = require("underscore");
var EXITING_MESSAGE = "Shell exiting...";

// Invoked by the server process to listen for incoming connections from
// shell clients. Each connection gets its own REPL instance.
exports.listen = function listen() {
  var socketFile = getSocketFile();
  fs.unlink(socketFile, function() {
    net.createServer(onConnection)
      .on("error", function(err){})
      .listen(socketFile);
  });
};

function onConnection(socket) {
  var dataSoFar = "";

  // Let connecting clients configure certain REPL options by sending a
  // JSON object over the socket. For example, only the client knows
  // whether it's running a TTY or an Emacs subshell or some other kind of
  // terminal, so the client must decide the value of options.terminal.
  socket.on("data", function onData(buffer) {
    // Just in case the options JSON comes in fragments.
    dataSoFar += buffer.toString("utf8");

    try {
      var options = JSON.parse(dataSoFar);
    } finally {
      if (! _.isObject(options)) {
        return; // Silence any parsing exceptions.
      }
    }

    socket.removeListener("data", onData);

    // Immutable options.
    _.extend(options, {
      input: socket,
      output: socket,
      eval: evalCommand
    });

    // Overridable options.
    _.defaults(options, {
      prompt: "> ",
      terminal: true,
      useColors: true,
      useGlobal: false,
      ignoreUndefined: true,
    });

    startREPL(options);
  });
}

function startREPL(options) {
  if (! options.output.columns) {
    // The REPL's tab completion logic assumes process.stdout is a TTY,
    // and while that isn't technically true here, we can get tab
    // completion to behave correctly if we fake the .columns property.
    options.output.columns = getTerminalWidth();
  }

  var repl = require("repl").start(options);

  // History persists across shell sessions!
  initializeHistory(repl);

  // Use the same `require` function and `module` object visible to the
  // shell.js module.
  repl.context.require = require;
  repl.context.module = module;
  repl.context.repl = repl;

  // Some improvements to the existing help messages.
  repl.commands[".break"].help =
    "Terminate current command input and display new prompt";
  repl.commands[".exit"].help = "Disconnect from server and leave shell";
  repl.commands[".help"].help = "Show this help information";

  // When the REPL exits, signal the attached client to exit by sending it
  // the special EXITING_MESSAGE.
  repl.on("exit", function() {
    options.output.write(EXITING_MESSAGE + "\n");
    options.output.end();
  });

  // When the server process exits, end the output stream but do not
  // signal the attached client to exit.
  process.on("exit", function() {
    options.output.end();
  });

  // This Meteor-specific shell command rebuilds the application as if a
  // change was made to server code.
  repl.defineCommand("reload", {
    help: "Restart the server and the shell",
    action: function() {
      process.exit(0);
    }
  });
}

function getSocketFile(appDir) {
  return path.join(appDir || getAppDir(), ".meteor", "local", "shell.sock");
}
exports.getSocketFile = getSocketFile;

// Unlinking the socket file causes all attached shell clients to
// disconnect and exit.
exports.unlinkSocketFile = function(appDir) {
  var socketFile = getSocketFile(appDir);
  try {
    fs.unlinkSync(socketFile);
    // Replace the socket file with a regular file so that any connected
    // shell clients will fail to connect with the ENOTSOCK error.
    fs.writeFileSync(socketFile, "not a socket\n");
  } catch (ignored) {}
};

function getHistoryFile(appDir) {
  return path.join(
    appDir || getAppDir(),
    ".meteor", "local", "shell-history"
  );
}

function getAppDir() {
  for (var dir = __dirname, nextDir;
       path.basename(dir) !== ".meteor";
       dir = nextDir) {
    nextDir = path.dirname(dir);
    if (dir === nextDir) {
      throw new Error("Not a Meteor app directory");
    }
  }
  return path.dirname(dir);
}

function getTerminalWidth() {
  try {
    // Inspired by https://github.com/TooTallNate/ttys/blob/master/index.js
    var fd = fs.openSync("/dev/tty", "r");
    assert.ok(tty.isatty(fd));
    var ws = new tty.WriteStream(fd);
    ws.end();
    return ws.columns;
  } catch (fancyApproachWasTooFancy) {
    return 80;
  }
}

// Shell commands need to be executed in fibers in case they call into
// code that yields.
function evalCommand(command, context, filename, callback) {
  Fiber(function() {
    try {
      var result = vm.runInThisContext(command, filename);
    } catch (error) {
      if (process.domain) {
        process.domain.emit("error", error);
        process.domain.exit();
      } else {
        callback(error);
      }
      return;
    }
    callback(null, result);
  }).run();
}

// This function allows a persistent history of shell commands to be saved
// to and loaded from .meteor/local/shell-history.
function initializeHistory(repl) {
  var rli = repl.rli;
  var historyFile = getHistoryFile();
  var historyFd = fs.openSync(historyFile, "a+");
  var historyLines = fs.readFileSync(historyFile, "utf8").split(EOL);
  var seenLines = Object.create(null);

  if (! rli.history) {
    rli.history = [];
    rli.historyIndex = -1;
  }

  while (rli.history && historyLines.length > 0) {
    var line = historyLines.pop();
    if (line && /\S/.test(line) && ! seenLines[line]) {
      rli.history.push(line);
      seenLines[line] = true;
    }
  }

  rli.addListener("line", function(line) {
    if (historyFd >= 0 && /\S/.test(line)) {
      fs.writeSync(historyFd, line + "\n");
    }
  });

  repl.on("exit", function() {
    fs.closeSync(historyFd);
    historyFd = -1;
  });
}

// Invoked by the process running `meteor shell` to attempt to connect to
// the server via the socket file.
exports.connect = function(appDir) {
  var socketFile = getSocketFile(appDir);
  var exitOnClose = false;
  var firstTimeConnecting = true;
  var connected = false;
  reconnect.count = 0;

  // We have to attach a "data" event even if we do nothing with the data
  // in order to put the stream in "flowing mode."
  function onData(buffer) {}

  function reconnect(delay) {
    // Display the "Server unavailable" warning only on the third attempt
    // to reconnect, so it doesn't get shown for successful reconnects.
    if (++reconnect.count === 3) {
      console.error(chalk.yellow(
        "Server unavailable (waiting to reconnect)"
      ));
    }

    if (!reconnect.timer) {
      reconnect.timer = setTimeout(function() {
        delete reconnect.timer;
        connect();
      }, delay || 100);
    }
  }

  function connect() {
    if (connected) {
      return;
    }

    var sock = net.connect(socketFile);

    process.stdin.on("data", onData);
    sock.pipe(process.stdout);
    sock.on("connect", onConnect);
    sock.on("close", onClose);
    sock.on("error", onError);

    function onConnect() {
      firstTimeConnecting = false;
      reconnect.count = 0;
      connected = true;

      // Sending a JSON-stringified options object (even just an empty
      // object) over the socket is required to start the REPL session.
      sock.write(JSON.stringify({
        terminal: !process.env.EMACS
      }));

      process.stderr.write(shellBanner());
      process.stdin.pipe(sock);
      process.stdin.setRawMode(true);
    }

    eachline(sock, "utf8", function(line) {
      exitOnClose = line.indexOf(EXITING_MESSAGE) >= 0;
    });

    function onClose() {
      tearDown();

      // If we received the special EXITING_MESSAGE just before the socket
      // closed, then exit the shell instead of reconnecting.
      if (exitOnClose) {
        process.exit(0);
      } else {
        reconnect();
      }
    }

    function onError(err) {
      tearDown();

      if (err.errno === "ENOENT" ||
          err.errno === "ECONNREFUSED") {
        // If the shell.sock file is missing or looks like a socket but is
        // not accepting connections, keep trying to connect.
        reconnect();

      } else if (err.errno === "ENOTSOCK") {
        // When the server shuts down completely, it replaces the
        // shell.sock file with a regular file to force connected shell
        // clients to disconnect and exit. If this shell client is
        // connecting for the first time, however, assume the user intends
        // to start the server again soon, and wait to reconnect.
        if (firstTimeConnecting) {
          reconnect();
        } else {
          process.exit(0);
        }
      }
    }

    function tearDown() {
      connected = false;
      process.stdin.unpipe(sock);
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(false);
      sock.unpipe(process.stdout);
      sock.removeListener("connect", onConnect);
      sock.removeListener("close", onClose);
      sock.removeListener("error", onError);
      sock.end();
    }
  }

  connect();
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
