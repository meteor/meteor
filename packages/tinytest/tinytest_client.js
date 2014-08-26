// Like Tinytest._runTests, but runs the tests on both the client and
// the server. Sets a 'server' flag on test results that came from the
// server.
//
// Options:
//   serial     if true, will not run tests in parallel.  Currently this means
//              running the server tests before running the client tests.
//              Default is currently true (serial operation), but we will likely
//              change this to false in future.
Tinytest._runTestsEverywhere = function (onReport, onComplete, pathPrefix, options) {
  var runId = Random.id();
  var localComplete = false;
  var localStarted = false;
  var remoteComplete = false;
  var done = false;

  options = _.extend({
    serial: true
  }, options);
  var serial = !!options.serial;

  var maybeDone = function () {
    if (!done && localComplete && remoteComplete) {
      done = true;
      onComplete && onComplete();
    }
    if (serial && remoteComplete && !localStarted) {
      startLocalTests();
    }
  };

  var startLocalTests = function() {
    localStarted = true;
    Tinytest._runTests(onReport, function () {
      localComplete = true;
      maybeDone();
    }, pathPrefix);
  };

  var handle;

  Meteor.connection.registerStore(Meteor._ServerTestResultsCollection, {
    update: function (msg) {
      // We only should call _runTestsEverywhere once per client-page-load, so
      // we really only should see one runId here.
      if (msg.id !== runId)
        return;
      // This will only work for added & changed messages.
      // hope that is all you get.
      _.each(msg.fields, function (report, key) {
        // Skip the 'complete' report (deal with it last)
        if (key === 'complete') {
          return;
        }
        _.each(report.events, function (event) {
          delete event.cookie; // can't debug a server test on the client..
        });
        report.server = true;
        onReport(report);
      });
      // Now that we've processed all the other messages,
      // check if we have the 'complete' message
      if (msg.fields && _.has(msg.fields, 'complete')) {
        remoteComplete = true;
        handle.stop();
        Meteor.call('tinytest/clearResults', runId);
        maybeDone();
      }
    }
  });

  handle = Meteor.subscribe(Meteor._ServerTestResultsSubscription, runId);

  Meteor.call('tinytest/run', runId, pathPrefix, function (error, result) {
    if (error)
      // XXX better report error
      throw new Error("Test server returned an error");
  });

  if (!serial) {
    startLocalTests();
  }
};
