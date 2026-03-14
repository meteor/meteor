var passed = 0;
var failed = 0;
var expected = 0;
var resultSet = {};
var whereFailed = [];
var serverDone = false;
var clientDone = false;
var clientConnected = false;

var getName = function (result) {
  return (result.server ? "S" : "C") + ": " +
    result.groupPath.join(" - ") + " - " + result.test;
};

var processResult = function (results) {
  var name = getName(results);
  if (!Object.hasOwn(resultSet, name)) {
    var testPath = EJSON.clone(results.groupPath);
    testPath.push(results.test);
    resultSet[name] = {
      name: name,
      status: "PENDING",
      events: [],
      server: !!results.server,
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
};

var printSummary = function () {
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

  if (!clientConnected) {
    console.log("");
    console.log("NOTE: Only server-side tests were run.");
    console.log("Client tests require a browser (use run.sh or set TEST_HEADLESS_BROWSER=1).");
  }

  if (failed > 0) {
    console.log("TESTS FAILED");
  } else {
    console.log("ALL TESTS PASSED");
  }

  process.exit(failed ? 1 : 0);
};

var maybePrintSummary = function () {
  if (serverDone && (clientDone || !clientConnected)) {
    printSummary();
  }
};

// Methods for the client to report results back via DDP
Meteor.methods({
  'test-headless/report'(result) {
    clientConnected = true;
    processResult(result);
  },
  'test-headless/done'() {
    clientDone = true;
    maybePrintSummary();
  }
});

// Run server-side tests directly
Meteor.startup(function () {
  console.log("test-headless listening");
  console.log("Running server-side tests...");

  Tinytest._runTests(function (results) {
    // Tag as server results
    results.server = true;
    processResult(results);
  }, function () {
    console.log("Server tests complete.");
    serverDone = true;

    // If no client connected, wait a short time then print summary.
    // If a client is connected, wait for it to finish.
    if (!clientConnected) {
      // Give the client a chance to connect (e.g., if run.sh is launching puppeteer)
      Meteor.setTimeout(function () {
        if (!clientConnected) {
          maybePrintSummary();
        }
      }, 10000);
    } else {
      maybePrintSummary();
    }
  });
});
