Handlebars = {
  _globalHelpers: {},

  registerHelper: function (name, func) {
    this._globalHelpers[name] = func;
  }
};

// Utility to HTML-escape a string.
Handlebars._escape = (function() {
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
