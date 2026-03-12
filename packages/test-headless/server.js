var passed = 0;
var failed = 0;
var expected = 0;
var resultSet = {};
var whereFailed = [];

var getName = function (result) {
  return "S: " + result.groupPath.join(" - ") + " - " + result.test;
};

Meteor.startup(function () {
  Tinytest._runTests(function (results) {
    var name = getName(results);
    if (!Object.hasOwn(resultSet, name)) {
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
        whereFailed.push({ name: name, info: JSON.stringify(event) });
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
          whereFailed.push({ name: name, info: JSON.stringify(resultSet[name].info) });
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
    if (failed > 0) {
      console.log("~~~~~~~ THERE ARE FAILURES ~~~~~~~");
    }
    console.log("passed/expected/failed/total",
                passed, "/", expected, "/", failed, "/", Object.keys(resultSet).length);

    if (whereFailed.length > 0) {
      console.log("");
      whereFailed.forEach(function (f) {
        console.log(f.name, "failed:", f.info);
      });
    }

    if (failed > 0) {
      console.log("TESTS FAILED");
    } else {
      console.log("ALL TESTS PASSED");
    }

    console.log("");
    console.log("NOTE: Only server-side tests were run. Client-only tests require a browser.");

    process.exit(failed ? 1 : 0);
  });
});
