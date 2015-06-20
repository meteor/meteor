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
//
var _debug = function (backend, self, args) {
  if (suppress) {
    suppress--;
    return;
  }
  args = Array.prototype.slice.call(args);
  if (typeof backend !== 'undefined') {
    if (args.length == 0) { // IE Companion breaks otherwise
      // IE10 PP4 requires at least one argument
      backend('');
    } else {
      // IE doesn't have console.log.apply, it's not a real Object.
      // http://stackoverflow.com/questions/5538972/console-log-apply-not-working-in-ie9
      // http://patik.com/blog/complete-cross-browser-console-log/
      if (typeof backend.apply === "function") {
        // Most browsers

        // Chrome and Safari only hyperlink URLs to source files in first argument of
        // backend, so try to call it with one argument if possible.
        // Approach taken here: If all args are strings, join them on space.
        // See https://github.com/meteor/meteor/pull/732#issuecomment-13975991
        var allargsOfTypeString = true;
        for (var i = 0; i < args.length; i++)
          if (typeof args[i] !== "string")
            allargsOfTypeString = false;

        if (allargsOfTypeString)
          backend.apply(self, [args.join(" ")]);
        else
          backend.apply(self, args);

      } else if (typeof Function.prototype.bind === "function") {
        // IE9
        var log = Function.prototype.bind.call(backend, self);
        log.apply(self, args);
      } else {
        // IE8
        Function.prototype.call.call(backend, self, args);
      }
    }
  }
};

Meteor._debug = function(/* arguments */) {
  if (typeof console !== 'undefined')
    _debug(console.log, console, arguments);
};

Meteor._error = function(/* arguments */) {
  if (typeof console !== 'undefined')
    _debug(console.error ? console.error : console.log, console, arguments);
};

Meteor._reportException = function(e, msg) {
  var eRepr;
  if (e.stack && e.stack.split) {
    var firstLine = e.stack.split('\n')[0];
    if(firstLine) {
      if(firstLine.indexOf(e.name) > -1)
        eRepr = e.stack;
      else
        eRepr = e.name + ': ' + e.message + '\n' + e.stack;
    } else
      eRepr = e.stack;
  } else
    eRepr = e.message || e;
  if(msg)
    Meteor._error(msg, eRepr);
  else
    Meteor._error(eRepr);
};

// Suppress the next 'count' Meteor._debug messsages. Use this to
// stop tests from spamming the console.
//
Meteor._suppress_log = function (count) {
  suppress += count;
};

Meteor._supressed_log_expected = function () {
  return suppress !== 0;
};
