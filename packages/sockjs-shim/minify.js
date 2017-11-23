"use strict";

// This script should be invoked before publishing the sockjs-shim package
// using the following command:
//
//   meteor node minify.js
//
// Any changes to the sockjs-*.min.js file should then be committed.

const {
  readdirSync,
  readFileSync,
  writeFileSync,
} = require("fs");

const {
  join: pathJoin
} = require("path");

const uglify =
  require("../minifier-js/.npm/package/node_modules/uglify-es");

const sourceFilePattern = /^sockjs-(\d+\.){3}js$/;

readdirSync(__dirname).some(item => {
  if (! sourceFilePattern.test(item)) {
    return false;
  }

  const parts = item.split(".");
  parts.push("min", parts.pop());
  const absSourcePath = pathJoin(__dirname, item);
  const absTargetPath = pathJoin(__dirname, parts.join("."));
  const source = readFileSync(absSourcePath, "utf8");

  // Compress with options similar to those used in
  // packages/minifier-js/minifier.js.
  const result = uglify.minify(source, {
    compress: {
      drop_debugger: false,
      unused: false,
      dead_code: true
    }
  });

  console.log("Minifying " + item + " and saving to " + absTargetPath);

  writeFileSync(absTargetPath, result.code);

  return true;
});
