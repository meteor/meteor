
var debugFunc;

// Meteor UI calls into user code in many places, and it's nice to catch exceptions
// propagated from user code immediately so that the whole system doesn't just
// break.  Catching exceptions is easy; reporting them is hard.  This helper
// reports exceptions.
//
// Usage:
//
// ```
// try {
//   // ... someStuff ...
// } catch (e) {
//   reportUIException(e);
// }
// ```
//
// An optional second argument overrides the default message.

reportUIException = function (e, msg) {
  if (! debugFunc)
    // adapted from Deps
    debugFunc = function () {
      return (typeof Meteor !== "undefined" ? Meteor._debug :
              ((typeof console !== "undefined") && console.log ? console.log :
               function () {}));
    };

  // In Chrome, `e.stack` is a multiline string that starts with the message
  // and contains a stack trace.  Furthermore, `console.log` makes it clickable.
  // `console.log` supplies the space between the two arguments.
  debugFunc()(msg || 'Exception in Meteor UI:', e.stack || e.message);
};
