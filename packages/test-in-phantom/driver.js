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
if (!platform)
  platform = "local";
console.log("URL", url);
var report = function (name, last) {
  if (url) {
    var namePath = name.split(" - ");
    var data = {
      run_id: Meteor.settings.public.runId,
      testPath: namePath,
      status: resultSet[name].status,
      platform: platform
    };
    if (!_.isEmpty(resultSet[name].events))
      data.events = resultSet[name].events;
    if (last)
      data.end = new Date();
    else
      data.start = new Date();
    if (Meteor.isServer) {
    } else {
      toReport.push({
        url: url,
        content: EJSON.stringify(data)
      });
    }
  }
};
var sendReports = function (callback) {
  var reports = toReport;
  if (!callback)
    callback = function () {};
  toReport = [];
  Meteor.call("report", reports, callback);
};
Meteor.startup(function () {
setTimeout(sendReports, 500);
setInterval(sendReports, 2000);
Meteor._runTestsEverywhere(
  function (results) {
    var name = getName(results);
    if (!_.has(resultSet, name)) {
      resultSet[name] = {name: name, status: "PENDING", events: []};
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
          console.log(name, ":", "OK", Meteor.isServer);
          passed++;
          break;
        case "EXPECTED":
          report(name, true);
          console.log(name, ":", "EXPECTED FAILURE", Meteor.isServer);
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
