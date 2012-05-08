// Like Meteor._runTests, but runs the tests on both the client and
// the server. Sets a 'server' flag on test results that came from the
// server.
Meteor._runTestsEverywhere = function (onReport, onComplete) {
  var run_id = LocalCollection.uuid();
  var local_complete = false;
  var remote_complete = false;
  var done = false;

  var maybeDone = function () {
    if (!done && local_complete && remote_complete) {
      done = true;
      onComplete && onComplete();
    }
  };

  Meteor._runTests(onReport, function () {
    local_complete = true;
    maybeDone();
  });

  Meteor.call('tinytest/run', run_id, function (error, result) {
    if (error)
      // XXX better report error
      throw new Error("Test server returned an error");
  });

  Meteor.default_connection.onQuiesce(function () {
    // XXX use _.defer to avoid calling into minimongo
    // reentrantly. we need to handle this better..
    // (XXX code got refactored -- still necessary?)
    _.defer(function () {
      // XXX this is a really sloppy way to GC the test results

      // XXX huge mess. have to use onQuiesce (supposed to be
      // private/for testing only) because otherwise we might start
      // removing the results before they've actually all arrived at
      // the client, since methods can complete before subs
      // update. or, could use the complete:true hack from before..
      Meteor._ServerTestResults.remove({run_id: run_id});

      // and of course we shouldn't print "All tests pass!"
      // until we have actually received the test results :)
      remote_complete = true;
      maybeDone();
    });
  });

  var sub_handle = Meteor.subscribe('tinytest/results', run_id);
  var query_handle = Meteor._ServerTestResults.find().observe({
    added: function (doc) {
      _.each(doc.report.events || [], function (event) {
        delete event.cookie; // can't debug a server test on the client..
      });
      doc.report.server = true;
      onReport(doc.report);
    }
  });
};
