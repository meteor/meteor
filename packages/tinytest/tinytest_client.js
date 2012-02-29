(function () {

var globals = (function () {return this;})();

_.extend(globals.test, {
  run: function (reportFunc, onComplete) {
    var run_id = LocalCollection.uuid();
    var local_complete = false;
    var remote_complete = false;
    var done = false;

    var maybeDone = function () {
      if (!done && local_complete && remote_complete) {
        done = true;
        // XXX this is a really sloppy way to GC the test results
        _.defer(function () {
          // XXX use _.defer to avoid calling into minimongo
          // reentrantly. we need to handle this better..
          Meteor._ServerTestResults.remove({run_id: run_id});
        });
        onComplete && onComplete();
      }
    };

    var testRun = Meteor._TestManager.createRun(reportFunc);
    test._currentRun.withValue(testRun, function () {
      testRun.run(function () {
        local_complete = true;
        maybeDone();
      });
    });

    App.call('tinytest/run', run_id, function (error, result) {
      if (error)
        // XXX better report error
        throw new Error("Test server returned an error");
      remote_complete = true;
      maybeDone();
    });

    var sub_handle = App.subscribe('tinytest/results', {run_id: run_id});
    var query_handle = Meteor._ServerTestResults.find().observe({
      added: function (doc) {
        _.each(doc.report.events || [], function (event) {
          delete event.cookie; // can't debug a server test on the client..
        });
        doc.report.server = true;
        reportFunc(doc.report);
      }
    });
  },

  debug: function (cookie, reportFunc, onComplete) {
    var testRun = Meteor._TestManager.createRun(reportFunc);
    test._currentRun.withValue(testRun, function () {
      testRun.debug(cookie, function () {
        onComplete && onComplete();
      });
    });
  }
});

})();
