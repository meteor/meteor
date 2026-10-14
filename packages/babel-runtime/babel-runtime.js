try {
  var babelRuntimeVersion = require("@babel/runtime/package.json").version;
} catch (e) {
  throw new Error([
    "",
    "The @babel/runtime npm package could not be found in your node_modules ",
    "directory. Please run the following command to install it:",
    "",
    "  meteor npm install --save @babel/runtime",
    ""
  ].join("\n"));
}

// Code compiled by @meteorjs/babel imports helpers such as
// @babel/runtime/helpers/regeneratorRuntime, which only exist in
// @babel/runtime 7.18.0 and later.
var babelRuntimeParts = babelRuntimeVersion.split(".");
var babelRuntimeMajor = parseInt(babelRuntimeParts[0], 10);
var babelRuntimeMinor = parseInt(babelRuntimeParts[1], 10);

if (babelRuntimeMajor < 7 ||
    (babelRuntimeMajor === 7 && babelRuntimeMinor < 18)) {
  console.error([
    "The version of @babel/runtime installed in your node_modules directory ",
    "(" + babelRuntimeVersion + ") is out of date. Please upgrade it by running ",
    "",
    "  meteor npm install --save @babel/runtime@latest",
    "",
    "in your application directory.",
    ""
  ].join("\n"));
}
