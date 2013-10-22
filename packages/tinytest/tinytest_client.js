// Like Tinytest._runTests, but runs the tests on both the client and
// the server. Sets a 'server' flag on test results that came from the
// server.
//
Tinytest._runTestsEverywhere = function (onReport, onComplete, pathPrefix) {
  var runId = Random.id();
  var localComplete = false;
  var remoteComplete = false;
  var done = false;

  var maybeDone = function () {
    if (!done && localComplete && remoteComplete) {
      done = true;
      onComplete && onComplete();
    }
  };

  Tinytest._runTests(onReport, function () {
    localComplete = true;
    maybeDone();
  }, pathPrefix);

  Meteor.connection.registerStore(Meteor._ServerTestResultsCollection, {
    update: function (msg) {
      // We only should call _runTestsEverywhere once per client-page-load, so
      // we really only should see one runId here.
      if (msg.id !== runId)
        return;
      // This will only work for added & changed messages.
      // hope that is all you get.
      _.each(msg.fields, function (report) {
        _.each(report.events, function (event) {
          delete event.cookie; // can't debug a server test on the client..
        });
        report.server = true;
        onReport(report);
      });
    }
  });

  var handle = Meteor.subscribe(Meteor._ServerTestResultsSubscription, runId);

  Meteor.call('tinytest/run', runId, pathPrefix, function (error, result) {
    if (error)
      // XXX better report error
      throw new Error("Test server returned an error");
    remoteComplete = true;
    handle.stop();
    Meteor.call('tinytest/clearResults', runId);
    maybeDone();
  });
};
