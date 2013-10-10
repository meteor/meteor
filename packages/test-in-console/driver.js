// Global flag for phantomjs (or other browser) to eval to see if we're done.
DONE = false;
// Failure count for phantomjs exit code
FAILURES = null;

TEST_STATUS = {
  DONE: false,
  FAILURES: null
};


var getName = function (result) {
  return (result.server ? "S: " : "C: ") +
    result.groupPath.join(" - ") + " - " + result.test;
};

var log = function (/*arguments*/) {
  if (typeof console !== 'undefined') {
    console.log.apply(console, arguments);
  }
};


var passed = 0;
var failed = 0;
var expected = 0;
var resultSet = {};
var toReport = [];

var hrefPath = document.location.href.split("/");
var platform = decodeURIComponent(hrefPath.length && hrefPath[hrefPath.length - 1]);
if (!platform)
  platform = "local";
var doReport = Meteor &&
      Meteor.settings &&
      Meteor.settings.public &&
      Meteor.settings.public.runId;
var report = function (name, last) {
  if (doReport) {
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
  if (doReport)
    Meteor.call("report", reports, callback);
  else
    callback();
};
Meteor.startup(function () {
  setTimeout(sendReports, 500);
  setInterval(sendReports, 2000);

  Tinytest._runTestsEverywhere(
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
        case "exception":
          log(name, ":", "!!!!!!!!! FAIL !!!!!!!!!!!");
          if (event.details && event.details.stack)
            log(event.details.stack);
          else
            log("Test failed with exception");
          failed++;
          break;
        case "finish":
          switch (resultSet[name].status) {
          case "OK":
            break;
          case "PENDING":
            resultSet[name].status = "OK";
            report(name, true);
            log(name, ":", "OK");
            passed++;
            break;
          case "EXPECTED":
            report(name, true);
            log(name, ":", "EXPECTED FAILURE");
            expected++;
            break;
          case "FAIL":
            failed++;
            report(name, true);
            log(name, ":", "!!!!!!!!! FAIL !!!!!!!!!!!");
            log(JSON.stringify(resultSet[name].info));
            break;
          default:
            log(name, ": unknown state for the test to be in");
          }
          break;
        default:
          resultSet[name].status = "FAIL";
          resultSet[name].info = results;
          break;
        }
      });
    },

    function () {
      if (failed > 0) {
        log("~~~~~~~ THERE ARE FAILURES ~~~~~~~");
      }
      log("passed/expected/failed/total", passed, "/", expected, "/", failed, "/", _.size(resultSet));
      sendReports(function () {
        if (doReport) {
          log("Waiting 3s for any last reports to get sent out");
          setTimeout(function () {
            TEST_STATUS.FAILURES = FAILURES = failed;
            TEST_STATUS.DONE = DONE = true;
          }, 3000);
        } else {
          TEST_STATUS.FAILURES = FAILURES = failed;
          TEST_STATUS.DONE = DONE = true;
        }
      });
    },
    ["tinytest"]);
});
