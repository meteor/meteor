// Some packages are unable to be compiled (usually because they are a
// dependency of the packages with the compiler).
// This script checks that these packages do not use new syntax so
// they do not cause syntax errors in old web browsers,
// and when used in build plugins can run in old Meteor versions

const clientEcmascriptVersion = 5;
// Node 8 (Meteor 1.6+) fully supports 2016, and supports most of 2017
const serverEcmascriptVersion = "2017";

// Latest version - (has TLA)
const latestEcmascriptVersion = "2022";

// By default, all files in these packages are expected to use es5 syntax
// Files only used on the server can be listed, which allows them to use
// some newer syntax (limited by the oldest Meteor version we want to support
// when the package is used in a build plugin)
// There is the fully ignoredFiles option, which allows files to use any
// syntax, but this should be avoided. Add a comment to the file explaining
// why it needs to use newer syntax.

// Note that if a package is able to use TLA (has a dependency on ecmascript),
// it can be removed from the list of packages this script runs on.
// This script is only needed for packages that can't use TLA/ecmascript.
const packages = {
  meteor: {
    serverFiles: [
      "server_environment.js",
      "dynamics_nodejs.js",
      "emitter-promise.js"
    ],

    // TODO: Fibers
    // Ignored server files that has a features > 2016
    ignoredFiles: [
      "async_helpers.js",
    ]
  },
  "accounts-ui": {},
  "audit-argument-checks": {},
  autopublish: {},
  "babel-compiler": {
    serverFiles: ["babel.js", "babel-compiler.js"],
  },
  "babel-runtime": {},
  "browser-policy": {},
  "browser-policy-common": {},
  // "browser-policy-content": {
  //   // TODO: Fibers
  //   // This is a server only file but it uses TLA.
  //   ignoredFiles: ["browser-policy-content.js"],
  // },
  "browser-policy-framing": {},
  // 'constraint-solver': {},
  crosswalk: {},
  // context: { Removed/moved to depracated, we don't need it anymore because of fibers
  //   serverFiles: ["context.js"],
  // },
  ddp: {},
  "disable-oplog": {},
  "dynamic-import": {
    serverFiles: ["security.js"],
  },
  ecmascript: {
    serverFiles: ["plugin.js", "ecmascript.js"],
  },
  "ecmascript-runtime": {},
  "ecmascript-runtime-client": {
    serverFiles: ["versions.js"],
  },
  "ecmascript-runtime-server": {},
  "es5-shim": {},
  fetch: {},
  "geojson-utils": {},
  "hot-code-push": {},
  "hot-module-replacement": {},
  insecure: {},
  "inter-process-messaging": {
    serverFiles: ["inter-process-messaging.js"],
  },
  "launch-screen": {},
  localstorage: {},
  "logic-solver": {
    // TODO: Fibers - Legacy
    // Revisit when we remove fibers, this may break for legacy
    ignoredFiles: ["logic.js", "optimize.js"],
  },
  "meteor-base": {},
  "mobile-experience": {},
  "mobile-status-bar": {},
  "modern-browsers": {
    serverFiles: ["modern.js"],
  },
  modules: {},
  "modules-runtime": {},
  "modules-runtime-hot": {},
  "mongo-dev-server": {},
  "mongo-livedata": {},
  "npm-mongo": {
    serverFiles: ["wrapper.js"],
  },
  "package-stats-opt-out": {},
  "package-version-parser": {},
  promise: {},
  "react-fast-refresh": {},
  "reactive-var": {},
  // "reload-safetybelt": {
  //   // is a server only file that uses TLA.
  //   ignoredFiles: ["reload-safety-belt.js"],
  // },
  sha: {},
  "standard-minifiers": {},
  // 'test-in-console': {},
  "test-server-tests-in-console-once": {},
  "tinytest-harness": {},
  "twitter-config-ui": {},
  // 'twitter-oauth': {},
  typescript: {
    serverFiles: ["plugin.js"],
  },
  url: {},
};

const acorn = require("acorn");
const fs = require("fs");
const path = require("path");

const baseDir = path.resolve(__dirname, "../../../");

Object.keys(packages).forEach((packageName) => {
  console.log(`=> Checking ${packageName}`);

  const packagePath = path.resolve(baseDir, "packages", packageName);
  let files = listPackageFiles(packagePath);

  for (const file of files) {
    let content = fs.readFileSync(file, "utf-8");
    let relPath = path.relative(packagePath, file);
    let ecmaVersion = clientEcmascriptVersion;

    if (
      packages[packageName].serverFiles?.includes(relPath) ||
      relPath.endsWith("_server.js") ||
      file.endsWith("/server.js")
    ) {
      // Is a server file, which can use some newer syntax
      ecmaVersion = serverEcmascriptVersion;
    }

    if (packages[packageName].ignoredFiles?.includes(relPath)) {
      // is a server file that may use a lot of newer syntax, such as TLA.
      ecmaVersion = latestEcmascriptVersion;
    }

    try {
      acorn.parse(content, {
        ecmaVersion,
      });
    } catch (error) {
      console.log("");
      console.error(`Failed to parse ${file}: `, error.message);
      let line = content.split("\n")[error.loc.line - 1];
      console.log(line);
      console.log("");

      process.exitCode = 1;
    }
  }
});

function listPackageFiles(rootPath) {
  let result = [];

  function walk(absPath) {
    let dirents = fs.readdirSync(absPath, { withFileTypes: true });

    for (const dirent of dirents) {
      if (
        dirent.name === "package.js" ||
        dirent.name.startsWith(".") ||
        // Only include js files
        !dirent.name.endsWith(".js") ||
        // Exclude tests
        dirent.name === "tests" ||
        dirent.name === "tests.js" ||
        dirent.name.endsWith("_tests.js") ||
        dirent.name.endsWith("_test.js") ||
        dirent.name.endsWith("-tests.js")
      ) {
        continue;
      }

      let childPath = path.resolve(absPath, dirent.name);

      if (dirent.isFile()) {
        result.push(childPath);
      } else if (dirent.isDirectory()) {
        walk(childPath);
      }
    }
  }

  walk(rootPath);

  return result;
}
