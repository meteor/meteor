Meteor.startup(function () {
  Meteor._ServerTestResults.remove();
});

Meteor.publish('tinytest/results', function (run_id) {
  return Meteor._ServerTestResults.find({run_id: run_id},
                                        {key: {collection: 'tinytest_results',
                                               run_id: run_id}});
});

Meteor.methods({
  'tinytest/run': function (run_id) {
    this.unblock();

    // XXX using private API === lame
    var Future = __meteor_bootstrap__.require('fibers/future');
    var future = new Future;

    Meteor._runTests(function (report) {
      /* onReport */
      Meteor._ServerTestResults.insert({run_id: run_id, report: report});
      Meteor.refresh({collection: 'tinytest_results', run_id: run_id});
    }, function () {
      /* onComplete */
      future.ret();
    });

    future.wait();
  }
});
