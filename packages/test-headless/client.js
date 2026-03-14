runTests = function () {
  // Only run CLIENT-side tests here.
  // Server tests are run directly by the server via Tinytest._runTests().
  // Using _runTests (not _runTestsEverywhere) avoids running server tests twice.
  Tinytest._runTests(
    function (results) {
      Meteor.call('test-headless/report', {
        groupPath: results.groupPath,
        test: results.test,
        events: results.events,
        server: false
      });
    },
    function () {
      // All client tests done — tell the server
      Meteor.call('test-headless/done');
    },
    ["tinytest"]
  );
};
