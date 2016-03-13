const onSuccessHook = new Hook({
  debugPrintExceptions: 'report.onSuccess callback'
});

const onFailHook = new Hook({
  debugPrintExceptions: 'report.onFail callback'
});

// Sends stats data to stats server and invokes callbacks
function report(cb = _.identity) {
  const stats = Stats.compose();

  Stats.send(stats, (err, result) => {
    // Resetting max sessions counter
    Stats.maxSessions = Stats.currSessions;

    if (err) {
      cb(err);
      onFailHook.each(fn => fn(err));
    }
    else {
      cb(null, result);
      onSuccessHook.each(fn => fn(result));
    }
  });
}

_.extend(report, {
  // Registers a callback for success
  onSuccess(fn) {
    return onSuccessHook.register(fn);
  },

  // Registers a callbacks for fail
  onFail(fn) {
    return onFailHook.register(fn);
  }
});

Reporter = report;