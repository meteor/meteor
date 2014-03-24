// XXX this file no longer makes sense in isolation.  take it apart as
// part file reorg on the 'ui' package
var globalHelpers = {};

UI.registerHelper = function (name, func) {
  globalHelpers[name] = func;
};

UI._globalHelper = function (name) {
  return globalHelpers[name];
};

// Utility to HTML-escape a string.
UI._escape  = (function() {
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

// XXX COMPAT WITH 0.7.2
Handlebars = {};
Handlebars._escape = UI._escape;
Handlebars.registerHelper = UI.registerHelper;

