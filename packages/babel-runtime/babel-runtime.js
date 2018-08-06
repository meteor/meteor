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

if (parseInt(babelRuntimeVersion, 10) < 6) {
  throw new Error([
    "",
    "The version of @babel/runtime installed in your node_modules directory ",
    "(" + babelRuntimeVersion + ") is out of date. Please upgrade it by running ",
    "",
    "  meteor npm install --save @babel/runtime",
    "",
    "in your application directory.",
    ""
  ].join("\n"));

} else if (babelRuntimeVersion.indexOf("7.0.0-beta.") === 0) {
  var betaVersion = parseInt(babelRuntimeVersion.split(".").pop(), 10);
  if (betaVersion > 55) {
    console.warn([
      "The version of @babel/runtime installed in your node_modules directory ",
      "(" + babelRuntimeVersion + ") contains a breaking change which was introduced by ",
      "https://github.com/babel/babel/pull/8266. Please either downgrade by ",
      "running the following command:",
      "",
      "  meteor npm install --save-exact @babel/runtime@7.0.0-beta.55",
      "",
      "or update to the latest beta version of Meteor 1.7.1, as explained in ",
      "this pull request: https://github.com/meteor/meteor/pull/9942.",
      ""
    ].join("\n"));
  }
}
