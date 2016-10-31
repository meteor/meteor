exports.meteorBabelHelpers = require("meteor-babel-helpers");

// Returns true if a given absolute identifier will be provided at runtime
// by the babel-runtime package.
exports.checkHelper = function checkHelper(id) {
  // There used to be more complicated logic here, when the babel-runtime
  // package provided helper implementations of its own, but now this
  // function exists just for backwards compatibility.
  return false;
};

try {
  var regeneratorRuntime = require("babel-runtime/regenerator");
} catch (e) {
  throw new Error([
    "The babel-runtime npm package could not be found in your node_modules ",
    "directory. Please run the following command to install it:",
    "",
    "  meteor npm install --save babel-runtime",
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
