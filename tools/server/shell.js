var assert = require("assert");
var path = require("path");
var stream = require("stream");
var fs = require("fs");
var tty = require("tty");
var chalk = require("chalk");
var EOL = require("os").EOL;

// The child process calls this function when it receives the SHELLSTART
// command from the parent process (via stdin).
function startREPL() {
  var input = process.stdin;
  var output = process.stdout;

  if (! output.columns) {
    // The REPL's tab completion logic assumes process.stdout is a TTY,
    // and while that isn't technically true here, we can get tab
    // completion to behave correctly if we fake the .columns property.
    output.columns = getTerminalWidth();
  }

  var repl = require("repl").start({
    prompt: "> ",
    input: input,
    output: output,
    terminal: !process.env.EMACS,
    useColors: true,
    useGlobal: true,
    ignoreUndefined: true
  });

  // History persists across shell sessions!
  initializeHistory(repl);

  // Use the same `require` function and `module` object visible to the
  // shell.js module.
  repl.context.require = require;
  repl.context.module = module;
  repl.context.repl = repl;

  function restartServer() {
    process.exit(1);
  }

  function terminateServer() {
    process.exit(0);
  }

  // This event is emitted when the user types ^C twice, ^D once, or
  // the .exit command.
  repl.on("exit", terminateServer);

  // Some improvements to the existing help messages.
  repl.commands[".break"].help =
    "Terminate current command input and display new prompt";
  repl.commands[".exit"].help = "Terminate the server and the shell";
  repl.commands[".help"].help = "Show this help information";

  // This Meteor-specific shell command rebuilds the application as if a
  // change was made to server code.
  repl.defineCommand("reload", {
    help: "Restart the server and the shell",
    action: restartServer
  });
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

function getDotMeteorDir() {
  for (var dir = __dirname, nextDir;
       path.basename(dir) !== ".meteor";
       dir = nextDir) {
    nextDir = path.dirname(dir);
    if (dir === nextDir) {
      throw new Error("Not a meteor project");
    }
  }
  return dir;
}

// This function allows a persistent history of shell commands to be saved
// to and loaded from .meteor/local/shell_history.
function initializeHistory(repl) {
  var rli = repl.rli;
  var historyFile = path.join(getDotMeteorDir(), "local", "shell_history");
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

function banner() {
  var bannerLines = [
    "",
    "Welcome to the server-side interactive shell!"
  ];

  if (! process.env.EMACS) {
    // Tab completion sadly does not work in Emacs.
    bannerLines.push(
      "",
      "Tab compeletion is enabled for global variables."
    );
  }

  bannerLines.push(
    "",
    "Type .reload to restart the server and the shell.",
    "Type .exit to teminate the server and the shell.",
    "Type .help for additional help.",
    EOL
  );

  return chalk.green(bannerLines.join(EOL));
}

// Called from the child process to listen for the SHELLSTART command sent
// from the parent process.
exports.listenForStart = function listenForStart() {
  var input = process.stdin;

  function listener(chunk) {
    var str = chunk.toString("utf8");
    if (str.match(/\bSHELLSTART\b/)) {
      // The parent process controls when the child process starts the
      // shell by writing the SHELLSTART command to the stdin stream of
      // the child process.
      input.removeListener("data", listener);
      startREPL();
    }
  }

  input.on("data", listener);
};

// Called from the parent process to set up childProcess.stdout and define
// the childProcess.startShell method.
exports.wrapChildProcess = function wrapChildProcess(childProcess) {
  var Console = require('../console.js').Console;
  var shellIsActive = false;

  // Hide the original stdout stream of the child process from the parent
  // process so that we can decide where to send the output based on
  // whether the shell is currently active or not.
  var realOutputStream = childProcess.stdout;
  var fakeOutputStream = new stream.PassThrough();
  childProcess.stdout = fakeOutputStream;

  realOutputStream.on("data", function(chunk) {
    if (shellIsActive) {
      // When the shell is active, write directly to the parent process
      // stdout stream, to avoid interception by eachline.
      process.stdout.write(chunk);
    } else {
      // When the shell is not active, write to the stream that the parent
      // process observes as childProcess.stdout.
      fakeOutputStream.write(chunk);
    }
  });

  childProcess.startShell = function startShell() {
    if (! shellIsActive) {
      shellIsActive = true;
      Console.enableProgressBar(false);
      process.stdout.write(banner());

      // Provided the child process has called listenForStart, this
      // "command" will signal it to start the REPL.
      childProcess.stdin.write("SHELLSTART\n");

      process.stdin.resume();
      process.stdin.setRawMode(true);
      process.stdin.pipe(childProcess.stdin);
    }
  };

  childProcess.on("exit", function stopShell(code) {
    if (shellIsActive) {
      shellIsActive = false;

      process.stdin.unpipe(childProcess.stdin);
      process.stdin.setRawMode(false);
      process.stdin.pause();

      Console.enableProgressBar(true);

      if (code === 0) {
        // Only terminate the parent process if the exit code is 0;
        // otherwise just restart the server and the shell.
        process.exit(code);
      }
    }
  });
};
