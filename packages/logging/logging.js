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
        console.log.apply(console, arguments);
      }
    }
  };

  // Suppress the next 'count' Meteor._debug messsages. Use this to
  // stop tests from spamming the console.
  Meteor._suppress_log = function (count) {
    suppress += count;
  }
})();
