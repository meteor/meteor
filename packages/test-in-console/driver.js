// Global flag for phantomjs (or other browser) to eval to see if we're done.
DONE = false;
// Failure count for phantomjs exit code
FAILURES = 0;
// Where are the failures
WHERE_FAILED = [];
// Passed count for phantomjs exit code
PASSED = null;

TEST_STATUS = {
  DONE: false,
  FAILURES: 0,
  PASSED: null,
  WHERE_FAILED: []
};

// xUnit format uses XML output
var XML_CHAR_MAP = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;',
  "'": '&apos;'
};

// Escapes a string for insertion into XML
var escapeXml = function (s) {
  return s.replace(/[<>&"']/g, function (c) {
    return XML_CHAR_MAP[c];
  });
}

// Returns a human name for a test
var getName = function (result) {
  return (result.server ? "S: " : "C: ") +
    result.groupPath.join(" - ") + " - " + result.test;
};

// Calls console.log, but returns silently if console.log is not available
var log = function (/*arguments*/) {
  if (typeof console !== 'undefined') {
    console.log.apply(console, arguments);
  }
};

var MAGIC_PREFIX = '##_meteor_magic##';
// Write output so that other tools can read it
// Output is sent to console.log, prefixed with the magic prefix and then the facility
// By grepping for the prefix, other tools can get the 'special' output
var logMagic = function (facility, s) {
  log(MAGIC_PREFIX + facility + ': ' + s);
};

// Logs xUnit output, if xunit output is enabled
// This uses logMagic with a facility of xunit
var xunit = function (s) {
  if (xunitEnabled) {
    logMagic('xunit', s);
  }
};

var passed = 0;
var failed = 0;
var whereFailed = [];
var expected = 0;
var resultSet = {};
var toReport = [];

var hrefPath = window.location.href.split("/");
var platform = decodeURIComponent(hrefPath.length && hrefPath[hrefPath.length - 1]);
if (!platform)
  platform = "local";

// We enable xUnit output when platform is xunit
var xunitEnabled = (platform == 'xunit');

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
    !(Object.keys(resultSet[name].events).length === 0)) {
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

runTests = function () {
  setTimeout(sendReports, 500);
  setInterval(sendReports, 2000);

  Tinytest._runTestsEverywhere(
    function (results) {
      var name = getName(results);
      if (!(name in resultSet)) {
        var testPath = EJSON.clone(results.groupPath);
        testPath.push(results.test);
        resultSet[name] = {
          name: name,
          status: "PENDING",
          events: [],
          server: !!results.server,
          testPath: testPath,
          test: results.test
        };
        report(name, false);
      }
      // Loop through events, and record status for each test
      // Also log result if test has finished
      results.events.forEach(function (event) {
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
          whereFailed.push({ name: name, info: JSON.stringify(event) });
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
            whereFailed.push({ name: name, info: JSON.stringify(resultSet[name].info) });
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

    // After test completion, log a quick summary
    function () {
      if (failed > 0) {
        log("~~~~~~~ THERE ARE FAILURES ~~~~~~~");
      }
      log("passed/expected/failed/total", passed, "/", expected, "/", failed, "/", Object.keys(resultSet).length);
      sendReports(function () {
        if (doReport) {
          log("Waiting 3s for any last reports to get sent out");
          setTimeout(function () {
            TEST_STATUS.FAILURES = FAILURES = failed;
            TEST_STATUS.WHERE_FAILED = WHERE_FAILED = whereFailed;
            TEST_STATUS.PASSED = PASSED = passed;
            TEST_STATUS.DONE = DONE = true;
          }, 3000);
        } else {
          TEST_STATUS.FAILURES = FAILURES = failed;
          TEST_STATUS.WHERE_FAILED = WHERE_FAILED = whereFailed;
          TEST_STATUS.PASSED = PASSED = passed;
          TEST_STATUS.DONE = DONE = true;
        }
      });

      // Also log xUnit output
      xunit('<testsuite errors="" failures="" name="meteor" skips="" tests="" time="">');
      Object.keys(resultSet).forEach(function (name) {
        let result = resultSet[name];

        var classname = result.testPath.join('.').replace(/ /g, '-') + (result.server ? "-server" : "-client");
        var name = result.test.replace(/ /g, '-') + (result.server ? "-server" : "-client");
        var time = "";
        var error = "";
        result.events.forEach(function (event) {
          switch (event.type) {
            case "finish":
              var timeMs = event.timeMs;
              if (timeMs !== undefined) {
                time = (timeMs / 1000) + "";
              }
              break;
            case "exception":
              var details = event.details || {};
              error = (details.message || '?') + " filename=" + (details.filename || '?') + " line=" + (details.line || '?');
              break;
          }
        });
        switch (result.status) {
          case "FAIL":
            error = error || '?';
            break;
          case "EXPECTED":
            error = null;
            break;
        }

        xunit('<testcase classname="' + escapeXml(classname) + '" name="' + escapeXml(name) + '" time="' + time + '">');
        if (error) {
          xunit('  <failure message="test failure">' + escapeXml(error) + '</failure>');
        }
        xunit('</testcase>');
      });
      xunit('</testsuite>');
      logMagic('state', 'done');
    },
    ["tinytest"]);
}
