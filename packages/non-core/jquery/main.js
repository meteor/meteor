try {
  var jQuery = require("jquery");
} catch (e) {
  console.warn([
    "The jquery npm package could not be found in your node_modules directory.",
    "Please run the following command to install it:",
    "",
    "  meteor npm install jquery",
    "",
    "If you previously relied on a specific version of jquery, it may be important",
    "to install that version; for example:",
    "",
    "  meteor npm install jquery@1.12.1",
    "",
  ].join("\n"));
}

if (jQuery) {
  // Provide values for the exported variables of the jquery package.
  exports.$ = exports.jQuery = jQuery;

  // There's no stopping legacy code from referring to window.$ or
  // window.jQuery, so we have to keep defining those properties globally,
  // but at least the exports of this package will be reliable.
  global.$ = global.$ || jQuery;
  global.jQuery = global.jQuery || jQuery;
}
