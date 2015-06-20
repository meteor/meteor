var debugFunc;

// We call into user code in many places, and it's nice to catch exceptions
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

// Set this to `true` to cause `reportException` to throw
// the next exception rather than reporting it.  This is
// useful in unit tests that test error messages.
Blaze._throwNextException = false;

Blaze._reportException = function (e, msg) {
  if (Blaze._throwNextException) {
    Blaze._throwNextException = false;
    throw e;
  }

  if (! debugFunc)
    // adapted from Tracker
    debugFunc = function () {
      return (typeof Meteor !== "undefined" ? Meteor._error :
              ((typeof console !== "undefined") &&
               (console.error ? console.error : console.log ? console.log :
               function () {})));
    };

  // In Chrome, `e.stack` is a multiline string that starts with the message
  // and contains a stack trace.  Furthermore, `console.log` makes it clickable.
  // `console.log` supplies the space between the two arguments.
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
  debugFunc()(msg || 'Exception caught in template:', eRepr);
};

Blaze._wrapCatchingExceptions = function (f, where) {
  if (typeof f !== 'function')
    return f;

  return function () {
    try {
      return f.apply(this, arguments);
    } catch (e) {
      Blaze._reportException(e, 'Exception in ' + where + ':');
    }
  };
};
