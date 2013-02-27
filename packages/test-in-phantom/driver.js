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
Meteor.startup(function () {
Meteor._runTestsEverywhere(
  function (results) {
    var name = getName(results);
    if (!_.has(resultSet, name)) {
      resultSet[name] = {name: name, status: "PENDING"};
    }
    _.each(results.events, function (event) {
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
    DONE = true;
  },
  ["tinytest"]);
});

})();
