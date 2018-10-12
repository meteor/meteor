exports.meteorBabelHelpers = require("meteor-babel-helpers");

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

if (parseInt(babelRuntimeVersion, 10) < 7 ||
    (babelRuntimeVersion.indexOf("7.0.0-beta.") === 0 &&
     parseInt(babelRuntimeVersion.split(".").pop(), 10) < 56)) {
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
