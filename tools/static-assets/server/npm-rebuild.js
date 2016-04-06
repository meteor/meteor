var path = require("path");
var spawn = require("child_process").spawn;

try {
  // This JSON file gets written in meteor/tools/isobuild/bundler.js.
  var rebuilds = require("./npm-rebuilds.json");
} catch (e) {
  if (e.code !== "MODULE_NOT_FOUND") {
    throw e;
  }
  // If npm-rebuilds.json was not written, assume there is nothing that
  // needs to be rebuilt.
}

// Make sure the npm finds this exact version of node in its $PATH.
var PATH = path.dirname(process.execPath) + ":" + process.env.PATH;
var env = Object.create(process.env, {
  PATH: { value: PATH }
});

function rebuild(i) {
  var dir = rebuilds && rebuilds[i];

  if (! dir) {
    // Print Node/V8/etc. versions for diagnostic purposes.
    spawn("npm", ["version", "--json"], {
      stdio: "inherit",
      env: env
    });

    return;
  }

  spawn("npm", ["rebuild"], {
    cwd: path.join(__dirname, dir),
    stdio: "inherit",
    env: env
  }).on("exit", function (code) {
    if (code !== 0) {
      process.exit(code);
    } else {
      rebuild(i + 1);
    }
  });
}

rebuild(0);
