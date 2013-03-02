DONE = false;

(function () {

var getName = function (result) {
  return (result.server ? "S: " : "C: ") +
    result.groupPath.join(" - ") + " - " + result.test;
};



var finished = 0;
var passed = 0;
var failed = 0;
var expected = 0;
var resultSet = {};
var toReport = [];

var url =  null;
if (Meteor.settings &&
    Meteor.settings.public &&
    !_.isEmpty(Meteor.settings.public.runId) &&
    !_.isEmpty(Meteor.settings.public.reportTo)) {
  url = Meteor.settings.public.reportTo +
      "/report/" +
      Meteor.settings.public.runId;
}

var hrefPath = document.location.href.split("/");
var platform = hrefPath.length && hrefPath[hrefPath.length - 1];
if (_.isEmpty(platform))
  platform = "local";
var report = function (name, last) {
  if (url && url !== "") {
    var data = {
      run_id: Meteor.settings.public.runId,
      testPath: resultSet[name].testPath,
      status: resultSet[name].status,
      platform: platform,
      server: resultSet[name].server,
      fullName: name.substr(3)
    };
    if ((data.status === "FAIL" || data.status === "EXPECTED") &&
        !_.isEmpty(resultSet[name].events)) {
      // only send events when bad things happen
      data.events = resultSet[name].events;
    }
    if (last)
      data.end = new Date();
    else
      data.start = new Date();
    toReport.push(EJSON.toJSONValue(data));
  }
};
var sendReports = function (callback) {
  var reports = toReport;
  if (!callback)
    callback = function () {};
  toReport = [];
  if (url)
    Meteor.call("report", url, reports, callback);
  else
    callback();
};
Meteor.startup(function () {
setTimeout(sendReports, 500);
setInterval(sendReports, 2000);

Meteor._runTestsEverywhere(
  function (results) {
    var name = getName(results);
    if (!_.has(resultSet, name)) {
      var testPath = EJSON.clone(results.groupPath);
      testPath.push(results.test);
      resultSet[name] = {
        name: name,
        status: "PENDING",
        events: [],
        server: !!results.server,
        testPath: testPath
      };
      report(name, false);
    }
    _.each(results.events, function (event) {
      resultSet[name].events.push(event);
      switch (event.type) {
      case "ok":
        break;
      case "expected_fail":
        if (resultSet[name].status !== "FAIL")
          resultSet[name].status = "EXPECTED";
        break;
      case "finish":
        switch (resultSet[name].status) {
        case "OK":
          break;
        case "PENDING":
          resultSet[name].status = "OK";
          report(name, true);
          console.log(name, ":", "OK");
          passed++;
          break;
        case "EXPECTED":
          report(name, true);
          console.log(name, ":", "EXPECTED FAILURE");
          expected++;
          break;
        case "FAIL":
          failed++;
          report(name, true);
          console.log(name, ":", "!!!!!!!!! FAIL !!!!!!!!!!!");
          console.log(JSON.stringify(resultSet[name].info));
          break;
        default:
          console.log(name, ": unknown state for the test to be in");
        }
        finished++;
        break;
      default:
        resultSet[name].status = "FAIL";
        resultSet[name].info = results;
        break;
      }
    });
  },

  function () {
    console.log("passed/expected/failed/total", passed, "/", expected, "/", failed, "/", _.size(resultSet));
    sendReports(function () {
      DONE = true;
    });
  },
  ["tinytest"]);
});

})();
