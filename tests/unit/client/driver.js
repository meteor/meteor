Results = Sky.Collection();

Template.header.passed_count = function () {
  return Results.find({type: "ok"}).length;
};

Template.header.failed_count = function () {
  return Results.find({type: "fail", expected: false}).length;
};

Template.header.expected_failed_count = function () {
  return Results.find({type: "fail", expected: true}).length;
};

Template.header.total_count = function () {
  return Results.find({type: {$in: ["ok", "fail"]}}).length;
};

Template.header.exception_count = function () {
  return Results.find({type: "exception"}).length;
};

Template.results.results = function () {
  return Results.find({}, {sort: {n: 1}});
};

Template.results.type_is = function (arg) {
  return this.type === arg;
};

Template.rerun_all_button.events = {
  "click": function () {
    run_tests();
  }
};

Template.exception.events = {
  "click .rerun": function () {
    run_tests(this.cookie);
  }
};

Template.fail.type_is = function (arg) {
  return this.type === arg;
};

Template.fail.events = {
  "click .rerun": function () {
    run_tests(this.cookie);
  }
};

var run_tests = function (through) {
  console.log("running tests");
  setTimeout(function () {
    Results.remove();
    test.run(Results, through);
  }, 0);
};

Sky.startup(function () {
  run_tests();
});
