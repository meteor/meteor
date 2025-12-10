const has = Npm.require('lodash.has');

var passed = 0;
var failed = 0;
var expected = 0;
var resultSet = {};

var getName = function (result) {
  return result.groupPath.join(" - ") + " - " + result.test;
};

Meteor.startup(function () {
  console.log("running server-side tests");
  Tinytest._runTests(function (results) {
    var name = getName(results);
    if (!has(resultSet, name)) {
      var testPath = EJSON.clone(results.groupPath);
      testPath.push(results.test);
      resultSet[name] = {
        name: name,
        status: "PENDING",
        events: [],
        testPath: testPath
      };
    }
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
        console.log(name, ":", "!!!!!!!!! FAIL !!!!!!!!!!!");
        if (event.details && event.details.stack)
          console.log(event.details.stack);
        else
          console.log("Test failed with exception");
        failed++;
        break;
      case "finish":
        switch (resultSet[name].status) {
        case "OK":
          break;
        case "PENDING":
          resultSet[name].status = "OK";
          console.log(name, ":", "OK");
          passed++;
          break;
        case "EXPECTED":
          console.log(name, ":", "EXPECTED FAILURE");
          expected++;
          break;
        case "FAIL":
          failed++;
          console.log(name, ":", "!!!!!!!!! FAIL !!!!!!!!!!!");
          console.log(JSON.stringify(resultSet[name].info));
          break;
        default:
          console.log(name, ": unknown state for the test to be in");
        }
        break;
      default:
        resultSet[name].status = "FAIL";
        resultSet[name].info = results;
        break;
      }
    });
  }, function () {
    console.log("passed/expected/failed/total",
                passed, "/", expected, "/", failed, "/", Object.keys(resultSet).length);
    if (failed > 0) {
      console.log("TESTS FAILED");
    } else {
      console.log("ALL TESTS PASSED");
    }
    process.exit(failed ? 1 : 0);
  });
});
