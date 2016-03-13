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
      onFailHook.each(callback => callback(err));
    }
    else {
      cb(null, result);
      onSuccessHook.each(cb => cb(result));
    }
  });
}

_.extend(report, {
  // Registers a callback for success
  onSuccess(cb) {
    return onSuccessHook.register(cb);
  },

  // Registers a callbacks for fail
  onFail(cb) {
    return onFailHook.register(cb);
  }
});

Reporter = report;