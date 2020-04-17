import assert from "assert";
import { join as pathJoin } from "path";
import { PassThrough } from "stream";
import {
  closeSync,
  openSync,
  readFileSync,
  unlink,
  writeFileSync,
  writeSync,
} from "fs";
import { createServer } from "net";
import { start as replStart } from "repl";

// Enable process.sendMessage for communication with build process.
import "meteor/inter-process-messaging";

const INFO_FILE_MODE = parseInt("600", 8); // Only the owner can read or write.
const EXITING_MESSAGE = "Shell exiting...";

// Invoked by the server process to listen for incoming connections from
// shell clients. Each connection gets its own REPL instance.
export function listen(shellDir) {
  function callback() {
    new Server(shellDir).listen();
  }

  // If the server is still in the very early stages of starting up,
  // Meteor.startup may not available yet.
  if (typeof Meteor === "object") {
    Meteor.startup(callback);
  } else if (typeof __meteor_bootstrap__ === "object") {
    const hooks = __meteor_bootstrap__.startupHooks;
    if (hooks) {
      hooks.push(callback);
    } else {
      // As a fallback, just call the callback asynchronously.
      setImmediate(callback);
    }
  }
}

// Disabling the shell causes all attached clients to disconnect and exit.
export function disable(shellDir) {
  try {
    // Replace info.json with a file that says the shell server is
    // disabled, so that any connected shell clients will fail to
    // reconnect after the server process closes their sockets.
    writeFileSync(
      getInfoFile(shellDir),
      JSON.stringify({
        status: "disabled",
        reason: "Shell server has shut down."
      }) + "\n",
      { mode: INFO_FILE_MODE }
    );
  } catch (ignored) {}
}

// Shell commands need to be executed in a Fiber in case they call into
// code that yields. Using a Promise is an even better idea, since it runs
// its callbacks in Fibers drawn from a pool, so the Fibers are recycled.
const evalCommandPromise = Promise.resolve();

class Server {
  constructor(shellDir) {
    assert.ok(this instanceof Server);

    this.shellDir = shellDir;
    this.key = Math.random().toString(36).slice(2);

    this.server =
      createServer((socket) => {
        this.onConnection(socket);
      })
      .on("error", (err) => {
        console.error(err.stack);
      });
  }

  listen() {
    const infoFile = getInfoFile(this.shellDir);

    unlink(infoFile, () => {
      this.server.listen(0, "127.0.0.1", () => {
        writeFileSync(infoFile, JSON.stringify({
          status: "enabled",
          port: this.server.address().port,
          key: this.key
        }) + "\n", {
          mode: INFO_FILE_MODE
        });
      });
    });
  }

  onConnection(socket) {
    // Make sure this function doesn't try to write anything to the socket
    // after it has been closed.
    socket.on("close", function() {
      socket = null;
    });

    // If communication is not established within 1000ms of the first
    // connection, forcibly close the socket.
    const timeout = setTimeout(function() {
      if (socket) {
        socket.removeAllListeners("data");
        socket.end(EXITING_MESSAGE + "\n");
      }
    }, 1000);

    // Let connecting clients configure certain REPL options by sending a
    // JSON object over the socket. For example, only the client knows
    // whether it's running a TTY or an Emacs subshell or some other kind of
    // terminal, so the client must decide the value of options.terminal.
    readJSONFromStream(socket, (error, options, replInputSocket) => {
      clearTimeout(timeout);

      if (error) {
        socket = null;
        console.error(error.stack);
        return;
      }

      if (options.key !== this.key) {
        if (socket) {
          socket.end(EXITING_MESSAGE + "\n");
        }
        return;
      }
      delete options.key;

      // Set the columns to what is being requested by the client.
      if (options.columns && socket) {
        socket.columns = options.columns;
      }
      delete options.columns;

      options = Object.assign(
        Object.create(null),

        // Defaults for configurable options.
        {
          prompt: "> ",
          terminal: true,
          useColors: true,
          ignoreUndefined: true,
        },

        // Configurable options
        options,

        // Immutable options.
        {
          input: replInputSocket,
          useGlobal: false,
          output: socket
        }
      );

      // The prompt during an evaluateAndExit must be blank to ensure
      // that the prompt doesn't inadvertently get parsed as part of
      // the JSON communication channel.
      if (options.evaluateAndExit) {
        options.prompt = "";
      }

      // Start the REPL.
      this.startREPL(options);

      if (options.evaluateAndExit) {
        this._wrappedDefaultEval.call(
          Object.create(null),
          options.evaluateAndExit.command,
          global,
          options.evaluateAndExit.filename || "<meteor shell>",
          function (error, result) {
            if (socket) {
              function sendResultToSocket(message) {
                // Sending back a JSON payload allows the client to
                // distinguish between errors and successful results.
                socket.end(JSON.stringify(message) + "\n");
              }

              if (error) {
                sendResultToSocket({
                  error: error.toString(),
                  code: 1
                });
              } else {
                sendResultToSocket({
                  result,
                });
              }
            }
          }
        );
        return;
      }
      delete options.evaluateAndExit;

      this.enableInteractiveMode(options);
    });
  }

  startREPL(options) {
    // Make sure this function doesn't try to write anything to the output
    // stream after it has been closed.
    options.output.on("close", function() {
      options.output = null;
    });

    const repl = this.repl = replStart(options);
    const { shellDir } = this;

    // This is technique of setting `repl.context` is similar to how the
    // `useGlobal` option would work during a normal `repl.start()` and
    // allows shell access (and tab completion!) to Meteor globals (i.e.
    // Underscore _, Meteor, etc.). By using this technique, which changes
    // the context after startup, we avoid stomping on the special `_`
    // variable (in `repl` this equals the value of the last command) from
    // being overridden in the client/server socket-handshaking.  Furthermore,
    // by setting `useGlobal` back to true, we allow the default eval function
    // to use the desired `runInThisContext` method (https://git.io/vbvAB).
    repl.context = global;
    repl.useGlobal = true;

    setRequireAndModule(repl.context);

    // In order to avoid duplicating code here, specifically the complexities
    // of catching so-called "Recoverable Errors" (https://git.io/vbvbl),
    // we will wrap the default eval, run it in a Fiber (via a Promise), and
    // give it the opportunity to decide if the user is mid-code-block.
    const defaultEval = repl.eval;

    function wrappedDefaultEval(code, context, file, callback) {
      if (Package.ecmascript) {
        try {
          code = Package.ecmascript.ECMAScript.compileForShell(code, {
            cacheDirectory: getCacheDirectory(shellDir)
          });
        } catch (err) {
          // Any Babel error here might be just fine since it's
          // possible the code was incomplete (multi-line code on the REPL).
          // The defaultEval below will use its own functionality to determine
          // if this error is "recoverable".
        }
      }

      evalCommandPromise
        .then(() => defaultEval(code, context, file, callback))
        .catch(callback);
    }

    // Have the REPL use the newly wrapped function instead and store the
    // _wrappedDefaultEval so that evalulateAndExit calls can use it directly.
    repl.eval = this._wrappedDefaultEval = wrappedDefaultEval;
  }

  enableInteractiveMode(options) {
    // History persists across shell sessions!
    this.initializeHistory();

    const repl = this.repl;

    // Implement an alternate means of fetching the return value,
    // via `__` (double underscore) as originally implemented in:
    // https://github.com/meteor/meteor/commit/2443d832265c7d1c
    Object.defineProperty(repl.context, "__", {
      get: () => repl.last,
      set: (val) => {
        repl.last = val;
      },

      // Allow this property to be (re)defined more than once (e.g. each
      // time the server restarts).
      configurable: true
    });

    // Some improvements to the existing help messages.
    function addHelp(cmd, helpText) {
      const info = repl.commands[cmd] || repl.commands["." + cmd];
      if (info) {
        info.help = helpText;
      }
    }
    addHelp("break", "Terminate current command input and display new prompt");
    addHelp("exit", "Disconnect from server and leave shell");
    addHelp("help", "Show this help information");

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
        if (process.sendMessage) {
          process.sendMessage("shell-server", { command: "reload" });
        } else {
          process.exit(0);
        }
      }
    });
  }

  // This function allows a persistent history of shell commands to be saved
  // to and loaded from .meteor/local/shell/history.
  initializeHistory() {
    const repl = this.repl;
    const historyFile = getHistoryFile(this.shellDir);
    let historyFd = openSync(historyFile, "a+");
    const historyLines = readFileSync(historyFile, "utf8").split("\n");
    const seenLines = Object.create(null);

    if (! repl.history) {
      repl.history = [];
      repl.historyIndex = -1;
    }

    while (repl.history && historyLines.length > 0) {
      const line = historyLines.pop();
      if (line && /\S/.test(line) && ! seenLines[line]) {
        repl.history.push(line);
        seenLines[line] = true;
      }
    }

    repl.addListener("line", function(line) {
      if (historyFd >= 0 && /\S/.test(line)) {
        writeSync(historyFd, line + "\n");
      }
    });

    this.repl.on("exit", function() {
      closeSync(historyFd);
      historyFd = -1;
    });
  }
}

function readJSONFromStream(inputStream, callback) {
  const outputStream = new PassThrough();
  let dataSoFar = "";

  function onData(buffer) {
    const lines = buffer.toString("utf8").split("\n");

    while (lines.length > 0) {
      dataSoFar += lines.shift();

      let json;
      try {
        json = JSON.parse(dataSoFar);
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

  let finished = false;
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

function getInfoFile(shellDir) {
  return pathJoin(shellDir, "info.json");
}

function getHistoryFile(shellDir) {
  return pathJoin(shellDir, "history");
}

function getCacheDirectory(shellDir) {
  return pathJoin(shellDir, "cache");
}

function setRequireAndModule(context) {
  if (Package.modules) {
    // Use the same `require` function and `module` object visible to the
    // application.
    const toBeInstalled = {};
    const shellModuleName = "meteor-shell-" +
      Math.random().toString(36).slice(2) + ".js";

    toBeInstalled[shellModuleName] = function (require, exports, module) {
      context.module = module;
      context.require = require;

      // Tab completion sometimes uses require.extensions, but only for
      // the keys.
      require.extensions = {
        ".js": true,
        ".json": true,
        ".node": true,
      };
    };

    // This populates repl.context.{module,require} by evaluating the
    // module defined above.
    Package.modules.meteorInstall(toBeInstalled)("./" + shellModuleName);
  }
}
