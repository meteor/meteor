(function () {
  var handlesForRun = {};
  var reportsForRun = {};

  Meteor.publish(Meteor._ServerTestResultsSubscription, function (runId) {
    var self = this;
    if (!_.has(handlesForRun, runId))
      handlesForRun[runId] = [self];
    else
      handlesForRun[runId].push(self);
    self.onStop(function () {
      handlesForRun[runId] = _.without(handlesForRun[runId], self);
    });
    if (_.has(reportsForRun, runId)) {
      self.set(Meteor._ServerTestResultsCollection, runId,
               reportsForRun[runId]);
    }
    self.complete();
    self.flush();
  });

  Meteor.methods({
    'tinytest/run': function (runId) {
      this.unblock();

      // XXX using private API === lame
      var path = __meteor_bootstrap__.require('path');
      var Future = __meteor_bootstrap__.require(path.join('fibers', 'future'));
      var future = new Future;

      reportsForRun[runId] = {};

      var onReport = function (report) {
        if (! Fiber.current) {
          Meteor._debug("Trying to report a test not in a fiber! "+
                        "You probably forgot to wrap a callback in bindEnvironment.");
          console.trace();
        }
        var dummyKey = Meteor.uuid();
        var setObject = {};
        setObject[dummyKey] = report;
        _.each(handlesForRun[runId], function (handle) {
          handle.set(Meteor._ServerTestResultsCollection, runId, setObject);
          handle.flush();
        });
        // Save for future subscriptions.
        reportsForRun[runId][dummyKey] = report;
      };

      var onComplete = function() {
        _.each(handlesForRun[runId], function (handle) {
          handle.stop();
        });
        delete handlesForRun[runId];
        delete reportsForRun[runId];
        future.ret();
      };

      Meteor._runTests(onReport, onComplete);

      future.wait();
    }
  });
}());
