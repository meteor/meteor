var assert = require("assert");
var path = require("path");
var stream = require("stream");
var fs = require("fs");
var net = require("net");
var tty = require("tty");
var vm = require("vm");
var _ = require("underscore");
var INFO_FILE_MODE = 0600; // Only the owner can read or write.
var EXITING_MESSAGE =
  // Exported so that ./client.js can know what to expect.
  exports.EXITING_MESSAGE = "Shell exiting...";

var Promise = require("meteor-promise");
// Only require("fibers") if somehow Promise.Fiber is not yet defined.
Promise.Fiber = Promise.Fiber || require("fibers");

// Invoked by the server process to listen for incoming connections from
// shell clients. Each connection gets its own REPL instance.
exports.listen = function listen(shellDir) {
  function callback() {
    new Server(shellDir).listen();
  }

  // If the server is still in the very early stages of starting up,
  // Meteor.startup may not available yet.
  if (typeof Meteor === "object") {
    Meteor.startup(callback);
  } else if (typeof __meteor_bootstrap__ === "object") {
    var hooks = __meteor_bootstrap__.startupHooks;
    if (hooks) {
      hooks.push(callback);
    } else {
      // As a fallback, just call the callback asynchronously.
      process.nextTick(callback);
    }
  }
};

// Disabling the shell causes all attached clients to disconnect and exit.
exports.disable = function disable(shellDir) {
  try {
    // Replace info.json with a file that says the shell server is
    // disabled, so that any connected shell clients will fail to
    // reconnect after the server process closes their sockets.
    fs.writeFileSync(
      getInfoFile(shellDir),
      JSON.stringify({
        status: "disabled",
        reason: "Shell server has shut down."
      }) + "\n",
      { mode: INFO_FILE_MODE }
    );
  } catch (ignored) {}
};

function Server(shellDir) {
  var self = this;
  assert.ok(self instanceof Server);

  self.shellDir = shellDir;
  self.key = Math.random().toString(36).slice(2);

  self.server = net.createServer(function(socket) {
    self.onConnection(socket);
  }).on("error", function(err) {
    console.error(err.stack);
  });
}

var Sp = Server.prototype;

Sp.listen = function listen() {
  var self = this;
  var infoFile = getInfoFile(self.shellDir);

  fs.unlink(infoFile, function() {
    self.server.listen(0, "127.0.0.1", function() {
      fs.writeFileSync(infoFile, JSON.stringify({
        status: "enabled",
        port: self.server.address().port,
        key: self.key
      }) + "\n", {
        mode: INFO_FILE_MODE
      });
    });
  });
};

function readJSONFromStream(inputStream, callback) {
  var outputStream = new stream.PassThrough;
  var dataSoFar = "";

  function onData(buffer) {
    var lines = buffer.toString("utf8").split("\n");

    while (lines.length > 0) {
      dataSoFar += lines.shift();

      try {
        var json = JSON.parse(dataSoFar);
      } catch (error) {
        if (error instanceof SyntaxError) {
          continue;
        }

        return finish(error);
      }

      if (lines.length > 0) {
        outputStream.write(lines.join("\n"));
      }

      inputStream.pipe(outputStream);

      return finish(null, json);
    }
  }

  function onClose() {
    finish(new Error("stream unexpectedly closed"));
  }

  var finished = false;
  function finish(error, json) {
    if (! finished) {
      finished = true;
      inputStream.removeListener("data", onData);
      inputStream.removeListener("error", finish);
      inputStream.removeListener("close", onClose);
      callback(error, json, outputStream);
    }
  }

  inputStream.on("data", onData);
  inputStream.on("error", finish);
  inputStream.on("close", onClose);
}

Sp.onConnection = function onConnection(socket) {
  var self = this;

  // Make sure this function doesn't try to write anything to the socket
  // after it has been closed.
  socket.on("close", function() {
    socket = null;
  });

  // If communication is not established within 1000ms of the first
  // connection, forcibly close the socket.
  var timeout = setTimeout(function() {
    if (socket) {
      socket.removeAllListeners("data");
      socket.end(EXITING_MESSAGE + "\n");
    }
  }, 1000);

  // Let connecting clients configure certain REPL options by sending a
  // JSON object over the socket. For example, only the client knows
  // whether it's running a TTY or an Emacs subshell or some other kind of
  // terminal, so the client must decide the value of options.terminal.
  readJSONFromStream(socket, function (error, options, replInputSocket) {
    clearTimeout(timeout);

    if (options.key !== self.key) {
      if (socket) {
        socket.end(EXITING_MESSAGE + "\n");
      }
      return;
    }
    delete options.key;

    if (options.evaluateAndExit) {
      evalCommand(
        "(" + options.evaluateAndExit.command + ")",
        null, // evalCommand ignores the context parameter, anyway
        options.evaluateAndExit.filename || "<meteor shell>",
        function (error, result) {
          if (socket) {
            var message = error ? {
              error: error + "",
              code: 1
            } : {
              result: result
            };

            // Sending back a JSON payload allows the client to
            // distinguish between errors and successful results.
            socket.end(JSON.stringify(message) + "\n");
          }
        }
      );
      return;
    }
    delete options.evaluateAndExit;

    // Immutable options.
    _.extend(options, {
      input: replInputSocket,
      output: socket,
      eval: evalCommand
    });

    // Overridable options.
    _.defaults(options, {
      prompt: "> ",
      terminal: true,
      useColors: true,
      useGlobal: true,
      ignoreUndefined: true,
    });

    self.startREPL(options);
  });
};

Sp.startREPL = function startREPL(options) {
  var self = this;

  if (! options.output.columns) {
    // The REPL's tab completion logic assumes process.stdout is a TTY,
    // and while that isn't technically true here, we can get tab
    // completion to behave correctly if we fake the .columns property.
    options.output.columns = getTerminalWidth();
  }

  // Make sure this function doesn't try to write anything to the output
  // stream after it has been closed.
  options.output.on("close", function() {
    options.output = null;
  });

  var repl = self.repl = require("repl").start(options);

  // History persists across shell sessions!
  self.initializeHistory();

  // Save the global `_` object in the server.  This is probably defined by the
  // underscore package.  It is unlikely to be the same object as the `var _ =
  // require('underscore')` in this file!
  var originalUnderscore = repl.context._;

  Object.defineProperty(repl.context, "_", {
    // Force the global _ variable to remain bound to underscore.
    get: function () { return originalUnderscore; },

    // Expose the last REPL result as __ instead of _.
    set: function(lastResult) {
      repl.context.__ = lastResult;
    },

    enumerable: true,

    // Allow this property to be (re)defined more than once (e.g. each
    // time the server restarts).
    configurable: true
  });

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
    if (options.output) {
      options.output.write(EXITING_MESSAGE + "\n");
      options.output.end();
    }
  });

  // When the server process exits, end the output stream but do not
  // signal the attached client to exit.
  process.on("exit", function() {
    if (options.output) {
      options.output.end();
    }
  });

  // This Meteor-specific shell command rebuilds the application as if a
  // change was made to server code.
  repl.defineCommand("reload", {
    help: "Restart the server and the shell",
    action: function() {
      process.exit(0);
    }
  });
};

function getInfoFile(shellDir) {
  return path.join(shellDir, "info.json");
}
exports.getInfoFile = getInfoFile;

function getHistoryFile(shellDir) {
  return path.join(shellDir, "history");
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

// Shell commands need to be executed in a Fiber in case they call into
// code that yields. Using a Promise is an even better idea, since it runs
// its callbacks in Fibers drawn from a pool, so the Fibers are recycled.
var evalCommandPromise = Promise.resolve();

function evalCommand(command, context, filename, callback) {
  if (Package.ecmascript) {
    var noParens = stripParens(command);
    if (noParens !== command) {
      var classMatch = /^\s*class\s+(\w+)/.exec(noParens);
      if (classMatch && classMatch[1] !== "extends") {
        // If the command looks like a named ES2015 class, we remove the
        // extra layer of parentheses added by the REPL so that the
        // command will be evaluated as a class declaration rather than as
        // a named class expression. Note that you can still type (class A
        // {}) explicitly to evaluate a named class expression. The REPL
        // code that calls evalCommand handles named function expressions
        // similarly (first with and then without parentheses), but that
        // code doesn't know about ES2015 classes, which is why we have to
        // handle them here.
        command = noParens;
      }
    }

    try {
      command = Package.ecmascript.ECMAScript.compileForShell(command);
    } catch (error) {
      callback(error);
      return;
    }
  }

  try {
    var script = new vm.Script(command, {
      filename: filename,
      displayErrors: false
    });
  } catch (parseError) {
    callback(parseError);
    return;
  }

  evalCommandPromise.then(function () {
    callback(null, script.runInThisContext());
  }).catch(callback);
}

function stripParens(command) {
  if (command.charAt(0) === "(" &&
      command.charAt(command.length - 1) === ")") {
    return command.slice(1, command.length - 1);
  }
  return command;
}

// This function allows a persistent history of shell commands to be saved
// to and loaded from .meteor/local/shell-history.
Sp.initializeHistory = function initializeHistory() {
  var self = this;
  var rli = self.repl.rli;
  var historyFile = getHistoryFile(self.shellDir);
  var historyFd = fs.openSync(historyFile, "a+");
  var historyLines = fs.readFileSync(historyFile, "utf8").split("\n");
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

  self.repl.on("exit", function() {
    fs.closeSync(historyFd);
    historyFd = -1;
  });
};
