Results = Sky.Collection();

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
