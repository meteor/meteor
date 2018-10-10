var createPage = require("webpage").create;
var system = require("system");
var platform = system.args[1] || "local";
var platformUrl = system.env.URL + platform;
var testUrls = [
  // Additional application URLs can be added here to re-run tests in
  // PhantomJS with different query parameter-based configurations.
  platformUrl,
];

function runNextUrl() {
  var url = testUrls.shift();
  if (! url) {
    phantom.exit(0);
    return;
  }

  console.log("Running Meteor tests in PhantomJS... " + url);

  var page = createPage();

  page.onConsoleMessage = function (message) {
    console.log(message);
  };

  page.open(url);

  function poll() {
    if (isDone(page)) {
      var failCount = getFailCount(page);
      if (failCount > 0) {
        phantom.exit(1);
      } else {
        page.close();
        setTimeout(runNextUrl, 1000);
      }
    } else {
      setTimeout(poll, 1000);
    }
  }

  poll();
}

function isDone(page) {
  return page.evaluate(function () {
    if (typeof TEST_STATUS !== "undefined") {
      return TEST_STATUS.DONE;
    }

    return typeof DONE !== "undefined" && DONE;
  });
}

function getFailCount(page) {
  return page.evaluate(function () {
    if (typeof TEST_STATUS !== "undefined") {
      return TEST_STATUS.FAILURES;
    }

    if (typeof FAILURES === "undefined") {
      return 1;
    }

    return 0;
  });
}

runNextUrl();
