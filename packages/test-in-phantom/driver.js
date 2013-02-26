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
        if (resultSet[name].status === "PENDING") {
          resultSet[name].status = "OK";
          console.log(name, ":", "OK");
          passed++;
        } else if (resultSet[name].status === "EXPECTED") {
          console.log(name, ":", "EXPECTED FAILURE");
          expected++;
        } else {
          failed++;
          console.log(name, ":", "!!!!!!!!! FAIL !!!!!!!!!!!");
          console.log(JSON.stringify(resultSet[name].info));
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
