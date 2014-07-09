var Fiber = Npm.require('fibers');
var handlesForRun = {};
var reportsForRun = {};

Meteor.publish(Meteor._ServerTestResultsSubscription, function (runId) {
  check(runId, String);
  var self = this;
  if (!_.has(handlesForRun, runId))
    handlesForRun[runId] = [self];
  else
    handlesForRun[runId].push(self);
  self.onStop(function () {
    handlesForRun[runId] = _.without(handlesForRun[runId], self);
  });
  if (_.has(reportsForRun, runId)) {
    self.added(Meteor._ServerTestResultsCollection, runId,
               reportsForRun[runId]);
  } else {
    self.added(Meteor._ServerTestResultsCollection, runId, {});
  }
  self.ready();
});

Meteor.methods({
  'tinytest/run': function (runId, pathPrefix) {
    check(runId, String);
    check(pathPrefix, Match.Optional([String]));
    this.unblock();

    reportsForRun[runId] = {};

    var addReport = function (key, report) {
      var fields = {};
      fields[key] = report;
      _.each(handlesForRun[runId], function (handle) {
        handle.changed(Meteor._ServerTestResultsCollection, runId, fields);
      });
      // Save for future subscriptions.
      reportsForRun[runId][key] = report;
    };

    var onReport = function (report) {
      if (! Fiber.current) {
        Meteor._debug("Trying to report a test not in a fiber! "+
                      "You probably forgot to wrap a callback in bindEnvironment.");
        console.trace();
      }
      var dummyKey = Random.id();
      addReport(dummyKey, report);
    };

    var onComplete = function() {
      // We send an object for current and future compatibility,
      // though we could get away with just sending { complete: true }
      var report = { done: true };
      var key = 'complete';
      addReport(key, report);
    };

    Tinytest._runTests(onReport, onComplete, pathPrefix);
  },
  'tinytest/clearResults': function (runId) {
    check(runId, String);
    _.each(handlesForRun[runId], function (handle) {
      // XXX this doesn't actually notify the client that it has been
      // unsubscribed.
      handle.stop();
    });
    delete handlesForRun[runId];
    delete reportsForRun[runId];
  }
});
