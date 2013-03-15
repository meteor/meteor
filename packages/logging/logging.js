(function() {
  var suppress = 0;

  // replacement for console.log. This is a temporary API. We should
  // provide a real logging API soon (possibly just a polyfill for
  // console?)
  //
  // NOTE: this is used on the server to print the warning about
  // having autopublish enabled when you probably meant to turn it
  // off. it's not really the proper use of something called
  // _debug. the intent is for this message to go to the terminal and
  // be very visible. if you change _debug to go someplace else, etc,
  // please fix the autopublish code to do something reasonable.
  Meteor._debug = function (/* arguments */) {
    if (suppress) {
      suppress--;
      return;
    }
    if (typeof console !== 'undefined' &&
        typeof console.log !== 'undefined') {
      if (arguments.length == 0) { // IE Companion breaks otherwise
        // IE10 PP4 requires at least one argument
        console.log('');
      } else {
        // IE doesn't have console.log.apply, it's not a real Object.
        // http://stackoverflow.com/questions/5538972/console-log-apply-not-working-in-ie9
        // http://patik.com/blog/complete-cross-browser-console-log/
        if (typeof console.log.apply === "function") {
          // Most browsers

          // Chrome and Safari only hyperlink URLs to source files in first argument of
          // console.log, so try to call it with one argument if possible.
          // Approach taken here: If all arguments are strings, join them on space.
          // See https://github.com/meteor/meteor/pull/732#issuecomment-13975991
          var allArgumentsOfTypeString = true;
          for (var i = 0; i < arguments.length; i++)
            if (typeof arguments[i] !== "string")
              allArgumentsOfTypeString = false;

          if (allArgumentsOfTypeString)
            console.log.apply(console, [Array.prototype.join.call(arguments, " ")]);
          else
            console.log.apply(console, arguments);

        } else if (typeof Function.prototype.bind === "function") {
          // IE9
          var log = Function.prototype.bind.call(console.log, console);
          log.apply(console, arguments);
        } else {
          // IE8
          Function.prototype.call.call(console.log, console, Array.prototype.slice.call(arguments));
        }
      }
    }
  };

  // Suppress the next 'count' Meteor._debug messsages. Use this to
  // stop tests from spamming the console.
  Meteor._suppress_log = function (count) {
    suppress += count;
  };
})();
