// If a developer wants to go to the trouble of building on exactly the
// same architecture as the production machine, then it should be possible
// to skip running `npm rebuild`.
if (process.env.METEOR_SKIP_NPM_REBUILD) {
  process.exit(0);
}

var fs = require("fs");
var path = require("path");
var spawn = require("child_process").spawn;
var rebuildArgs = require("./npm-rebuild-args.js").get();

try {
  // This JSON file gets written in meteor/tools/isobuild/bundler.js.
  var rebuilds = require("./npm-rebuilds.json");
} catch (e) {
  if (e.code !== "MODULE_NOT_FOUND") {
    throw e;
  }

  // If npm-rebuilds.json was not written, assume there is nothing that
  // needs to be rebuilt.
  process.exit(0);
}

// Make sure the npm finds this exact version of node in its $PATH.
var binDir = path.dirname(process.execPath);
process.env.PATH = binDir + path.delimiter + process.env.PATH;

var npmCmd = "npm";
if (process.platform === "win32") {
  var npmCmdPath = path.join(binDir, "npm.cmd");
  if (fs.existsSync(npmCmdPath)) {
    npmCmd = npmCmdPath;
  }
}

function rebuild(i) {
  var dir = rebuilds && rebuilds[i];

  if (! dir) {
    // Print Node/V8/etc. versions for diagnostic purposes.
    spawn(npmCmd, ["version", "--json"], {
      stdio: "inherit"
    });

    return;
  }

  spawn(npmCmd, rebuildArgs, {
    cwd: path.join(__dirname, dir),
    stdio: "inherit"
  }).on("exit", function (code) {
    if (code !== 0) {
      process.exit(code);
    } else {
      rebuild(i + 1);
    }
  });
}

rebuild(0);
