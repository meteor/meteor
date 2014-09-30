var assert = require("assert");
var inspector = require("node-inspector");
var inspectorBinPath = require.resolve("node-inspector/bin/inspector");
var spawn = require("child_process").spawn;
var chalk = require("chalk");
var EOL = require("os").EOL;
var debugPortToProcess = [];
var hasOwn = Object.prototype.hasOwnProperty;

function start(debugPort) {
  debugPort = +(debugPort || 5858);

  // Port 8080 is the default port that node-inspector uses for its web
  // server, and port 5858 is the default port that node listens on when
  // it receives the --debug or --debug-brk flags. Developers familiar
  // with node-inspector may have http://localhost:8080/debug?port=5858
  // saved in their browser history already, so let's stick with these
  // conventions in the default case (unless of course the developer runs
  // `meteor debug --debug-port <some other port>`).
  var webPort = 8080 + debugPort - 5858;

  if (hasOwn.call(debugPortToProcess, debugPort)) {
    return debugPortToProcess[debugPort];
  }

  var proc = spawn(process.execPath, [
    inspectorBinPath,
    "--web-port", "" + webPort,
    "--debug-port", "" + debugPort
  ]);

  proc.url = inspector.buildInspectorUrl(
    "localhost",
    webPort,
    debugPort
  );

  // Forward error output to process.stderr, but silence normal output.
  // proc.stdout.pipe(process.stdout);
  proc.stderr.pipe(process.stderr);

  proc.on("exit", function(code) {
    // Restart the process if it died without us explicitly stopping it.
    if (debugPortToProcess[debugPort] === proc) {
      delete debugPortToProcess[debugPort];
      start(debugPort);
    }
  });

  debugPortToProcess[debugPort] = proc;

  return proc;
}

function banner(debugPort) {
  debugPort = +(debugPort || 5858);
  var proc = debugPortToProcess[debugPort];
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
    "",
    chalk.green([
      "To debug the server process using the command-line node debugger, ",
      "execute this command in another terminal window:",
    ].join(EOL)),
    chalk.cyan(process.execPath + " debug localhost:" + debugPort),
    EOL
  ].join(EOL);
}

function stop(debugPort) {
  debugPort = +(debugPort || 5858);

  var proc = debugPortToProcess[debugPort];
  if (proc.kill) {
    console.error("killed " + proc.pid);
    proc.kill();
  }

  delete debugPortToProcess[debugPort];
}

require("./cleanup.js").onExit(function killAll() {
  for (var debugPort in debugPortToProcess) {
    stop(debugPort);
  }
  debugPortToProcess.length = 0;
});

exports.start = start;
exports.banner = banner;
exports.stop = stop;
