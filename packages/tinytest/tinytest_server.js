Meteor.startup(function () {
  Meteor._ServerTestResults.remove();
});

App.publish('tinytest/results', function (sub, params) {
  return Meteor._ServerTestResults.find({run_id: params.run_id});
});

App.methods({
  'tinytest/run': function (run_id) {
    var request = this;
    request.beginAsync();

    var reportFunc = function (report) {
      Meteor._ServerTestResults.insert({run_id: run_id, report: report});
    };

    var testRun = Meteor._TestManager.createRun(reportFunc);
    testRun.run(function () {
      request.respond();
    });
  }
});
