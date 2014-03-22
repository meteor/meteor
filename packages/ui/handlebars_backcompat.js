// XXX this file no longer makes sense in isolation.  take it apart as
// part file reorg on the 'ui' package
var globalHelpers = {};

UI.registerHelper = function (name, func) {
  globalHelpers[name] = func;
};

UI._globalHelper = function (name) {
  return globalHelpers[name];
};

Handlebars = {};
Handlebars.registerHelper = UI.registerHelper;

// Utility to HTML-escape a string.
UI._escape = Handlebars._escape = (function() {
  var escape_map = {
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "`": "&#x60;", /* IE allows backtick-delimited attributes?? */
    "&": "&amp;"
  };
  var escape_one = function(c) {
    return escape_map[c];
  };

  return function (x) {
    return x.replace(/[&<>"'`]/g, escape_one);
  };
})();

// Return these from {{...}} helpers to achieve the same as returning
// strings from {{{...}}} helpers
Handlebars.SafeString = function(string) {
  this.string = string;
};
Handlebars.SafeString.prototype.toString = function() {
  return this.string.toString();
};
