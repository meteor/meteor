// Setup mock data for tests
var Packages = new LocalCollection;
var Versions = new LocalCollection;
var Builds = new LocalCollection;

Packages.insert({ name: "sparky-forms" });
Packages.insert({ name: "forms" });
Packages.insert({ name: "sparkle" });
Packages.insert({ name: "awesome-dropdown" });
Packages.insert({ name: "dropdown" });
Packages.insert({ name: "jquery-widgets" });
Packages.insert({ name: "jquery" });

var insertVersion = function (name, version, ecv, deps) {
  var constructedDeps = {};
  _.each(deps, function (constraint, name) {
    constructedDeps[name] = {
      constraint: constraint,
      references: [
        { slice: "os", arch: "all", targetSlice: "os", weak: false,
          implied: false, unordered: false },
        { slice: "browser", arch: "all", targetSlice: "browser", weak: false,
          implied: false, unordered: false }]
    };
  });
  Versions.insert({ packageName: name, version: version, earliestCompatibleVersion: ecv,
                    dependencies: constructedDeps });
};
insertVersion("sparky-forms", "1.1.2", "1.0.0", {"forms": "=1.0.1", "sparkle": "=2.1.1"});
insertVersion("forms", "1.0.1", "1.0.0", {"sparkle": "2.1.0", "jquery-widgets": "1.0.0"});
insertVersion("sparkle", "2.1.0", "2.1.0", {"jquery": "1.8.2"});
insertVersion("sparkle", "2.1.1", "2.1.0", {"jquery": "1.8.2"});
insertVersion("sparkle", "1.0.0", "1.0.0");
insertVersion("awesome-dropdown", "1.5.0", "1.0.0", {"dropdown": "=1.2.2"});
insertVersion("dropdown", "1.2.2", "1.0.0", {"jquery-widgets": "1.0.0"});
insertVersion("jquery-widgets", "1.0.0", "1.0.0", {"jquery": "1.8.0", "sparkle": "2.1.1"});
insertVersion("jquery-widgets", "1.0.2", "1.0.0", {"jquery": "1.8.0", "sparkle": "2.1.1"});
insertVersion("jquery", "1.8.0", "1.8.0");
insertVersion("jquery", "1.8.2", "1.8.0");

var insertBuild = function (name, version, ecv) {
  Builds.insert({ packageName: name, version: version,
                  earliestCompatibleVersion: ecv, architecture: [ "browser", "os" ] });
};

insertBuild("sparky-forms", "1.1.2", "1.1.0");
insertBuild("forms", "1.0.1", "1.0.0");
insertBuild("sparkle", "2.1.1", "2.1.0");
insertBuild("sparkle", "2.1.0", "2.1.0");
insertBuild("sparkle", "1.0.0", "1.0.0");
insertBuild("awesome-dropdown", "1.5.0", "1.0.0");
insertBuild("dropdown", "1.2.2", "1.0.0");
insertBuild("jquery-widgets", "1.0.0", "1.0.0");
insertBuild("jquery-widgets", "1.0.2", "1.0.0");
insertBuild("jquery", "1.8.0", "1.0.0");
insertBuild("jquery", "1.9.0", "1.0.0");

var resolver = new ConstraintSolver.Resolver(Packages, Versions, Builds);

var currentTest = null;
var t = function (deps, expected) {
  var resolvedDeps = resolver.resolve(deps);
  currentTest.equal(resolvedDeps, expected);
};

var t_progagateExact = function (deps, expected) {
  var resolvedDeps = resolver.propagatedExactDeps(deps);
  currentTest.equal(resolvedDeps, expected);
};

var FAIL = function (deps) {
  currentTest.throws(function () {
    var resolvedDeps = resolver.resolve(deps);
  });
};

Tinytest.add("constraint solver - exact dependencies", function (test) {
  currentTest = test;
  t_progagateExact({ "sparky-forms": "=1.1.2" }, { "sparky-forms": "1.1.2", "forms": "1.0.1", "sparkle": "2.1.1" });
  t_progagateExact({ "sparky-forms": "=1.1.2", "forms": "=1.0.1" }, { "sparky-forms": "1.1.2", "forms": "1.0.1", "sparkle": "2.1.1" });
  t_progagateExact({ "sparky-forms": "=1.1.2", "sparkle": "=2.1.1" }, { "sparky-forms": "1.1.2", "forms": "1.0.1", "sparkle": "2.1.1" });
  t_progagateExact({ "awesome-dropdown": "=1.5.0" }, { "awesome-dropdown": "1.5.0", "dropdown": "1.2.2" });

  FAIL({ "sparky-forms": "=1.1.2", "sparkle": "=1.0.0" });
  // something that isn't available for your architecture
  FAIL({ "sparky-forms": "=1.1.2", "sparkle": "=2.0.0" });
  FAIL({ "sparky-forms": "=0.0.1" });
});

Tinytest.add("constraint solver - simple exact + regular deps", function (test) {
  currentTest = test;
  t({ "sparky-forms": "=1.1.2" }, {
    "sparky-forms": "1.1.2",
    "forms": "1.0.1",
    "sparkle": "2.1.1",
    "jquery-widgets": "1.0.0",
    "jquery": "1.8.2"
  });

  t({ "sparky-forms": "=1.1.2", "awesome-dropdown": "=1.5.0" }, {
    "sparky-forms": "1.1.2",
    "forms": "1.0.1",
    "sparkle": "2.1.1",
    "jquery-widgets": "1.0.0",
    "jquery": "1.8.2",
    "awesome-dropdown": "1.5.0",
    "dropdown": "1.2.2"
  });
});

Tinytest.add("constraint solver - non-exact direct dependency", function (test) {
  currentTest = test;
  // sparky-forms 1.0.0 won't be chosen because it depends on a very old
  // jquery, which is not compatible with the jquery that
  // awesome-dropdown uses.
  t({ "sparky-forms": "1.0.0", "awesome-dropdown": "=1.5.0" }, {
    "sparky-forms": "1.1.2",
    "forms": "1.0.1",
    "sparkle": "2.1.1",
    "jquery-widgets": "1.0.0",
    "jquery": "1.8.2",
    "awesome-dropdown": "1.5.0",
    "dropdown": "1.2.2"
  });
});
