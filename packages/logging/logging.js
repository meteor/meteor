if (typeof Meteor === "undefined") Meteor = {};

(function() {
  // replacement for console.log. This is a temporary API. We should
  // provide a real logging API soon (possibly just a polyfill for
  // console?)
  Meteor._debug = function (/* varargs */) {
    if (typeof console !== 'undefined' &&
        typeof console.log !== 'undefined') {
      if (arguments.length == 0) {
        console.log(); // IE Companion breaks otherwise
      } else {
        console.log.apply(console, arguments);
      }
    }
  }
})();
