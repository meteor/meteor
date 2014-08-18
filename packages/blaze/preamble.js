Blaze = {};

// Utility to HTML-escape a string.  Included for legacy reasons.
Blaze._escape = (function() {
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

Blaze._warn = function (msg) {
  msg = 'Warning: ' + msg;

  if ((typeof 'Log' !== 'undefined') && Log && Log.warn)
    Log.warn(msg); // use Meteor's "logging" package
  else if ((typeof 'console' !== 'undefined') && console.log)
    console.log(msg);
};

// For the sake of error messages, try to work out if this is Meteor
// (and say "UI.render", etc.) or just Blaze ("Blaze.render");
Blaze._symbol = function () {
  return ((typeof UI !== 'undefined') && UI === Blaze) ? 'UI' : 'Blaze';
};
