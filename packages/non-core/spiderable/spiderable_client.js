// We want to provide a deteriministic indicator of when the page is 'done'
// This is non-trivial: e.g. an infinite stream of tweets is never done.
//
// We do this instead:
//   We are done sometime after all initial subscriptions are ready
//   Initial subscriptions are those started in the top-level script execution,
//   or from a Meteor.startup callback when Meteor.startup is called in
//   top-level script execution.
//
// Note that we don't guarantee that we won't wait longer than we have to;
// extra subscriptions may be made, and extra data past the minimum may be
// received.
//
// We set this 'started' flag as Package.spiderable.Spiderable._initialSubscriptionsStarted
// This is used by our phantomjs to determine when the subscriptions are started;
// it then polls until all subscriptions are ready.

Spiderable._initialSubscriptionsStarted = false;

Spiderable._onReadyHook = new Hook({
  debugPrintExceptions: "Spiderable.addReadyCondition callback"
});

// register a new onReady hook for validation
Spiderable.addReadyCondition = function (fn) {
  return Spiderable._onReadyHook.register(fn);
};

//
// register default hooks

// top level code ready
Spiderable.addReadyCondition(function () {
  // subs & top level code (startup) completed
  return Spiderable._initialSubscriptionsStarted;
})
var startupCallbacksDone = function () {
  Spiderable._initialSubscriptionsStarted = true;
};
// This extra indirection is how we get called last
var topLevelCodeDone = function () {
  // We'd like to use Meteor.startup here I think, but docs/behaviour of that is wrong
  Meteor._setImmediate(function () { startupCallbacksDone(); });
};
Meteor.startup(function () { topLevelCodeDone(); });

// all ddp subs ready
Spiderable.addReadyCondition(function () {
  Tracker.flush();
  return DDP._allSubscriptionsReady();
})

// run all hooks and return true if they all pass
Spiderable.isReady = function () {
  var isReady = true;
  Spiderable._onReadyHook.each(function (callback) {
    if (callback()) {
      return true; // next callback
    } else {
      isReady = false;
      return false; // stop immediately
    }
  });
  return isReady;
};

