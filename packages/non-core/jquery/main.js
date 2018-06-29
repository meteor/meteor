var global = this;

try {
  var jQuery = require("jquery");
} catch (e) {
  jQuery = require("./jquery.js");
}

// Provide values for the exported variables of the jquery package.
exports.$ = exports.jQuery = jQuery;

// There's no stopping legacy code from referring to window.$ or
// window.jQuery, so we have to keep defining those properties globally,
// but at least the exports of this package will be reliable.
global.$ = global.$ || jQuery;
global.jQuery = global.jQuery || jQuery;
