UI = {};

UI._globalHelpers = {};

UI.registerHelper = function (name, func) {
  UI._globalHelpers[name] = func;
};

// Utility to HTML-escape a string.
UI._escape = (function() {
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

var jsUrlsAllowed = false;
UI._allowJavascriptUrls = function () {
  jsUrlsAllowed = true;
};
UI._javascriptUrlsAllowed = function () {
  return jsUrlsAllowed;
};

UI._parentData = Blaze._parentData;
