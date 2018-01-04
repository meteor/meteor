exports.meteorBabelHelpers = require("meteor-babel-helpers");

try {
  var babelRuntimeVersion = require("@babel/runtime/package.json").version;
  var regeneratorRuntime = require("@babel/runtime/regenerator");
} catch (e) {
  throw new Error([
    "The @babel/runtime npm package could not be found in your node_modules ",
    "directory. Please run the following command to install it:",
    "",
    "  meteor npm install --save @babel/runtime",
    ""
  ].join("\n"));
}

if (parseInt(babelRuntimeVersion, 10) < 6) {
  throw new Error([
    "The version of @babel/runtime installed in your node_modules directory ",
    "(" + babelRuntimeVersion + ") is out of date. Please upgrade it by running ",
    "",
    "  meteor npm install --save @babel/runtime",
    "",
    "in your application directory.",
    ""
  ].join("\n"));
}

if (regeneratorRuntime &&
    typeof Promise === "function" &&
    typeof Promise.asyncApply === "function") {
  // If Promise.asyncApply is defined, use it to wrap calls to
  // runtime.async so that the entire async function will run in its own
  // Fiber, not just the code that comes after the first await.
  var realAsync = regeneratorRuntime.async;
  regeneratorRuntime.async = function () {
    return Promise.asyncApply(realAsync, regeneratorRuntime, arguments);
  };
}
