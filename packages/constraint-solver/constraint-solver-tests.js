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

var insertVersion = function (name, version, ecv) {
  Versions.insert({ packageName: name, version: version, earliestCompatibleVersion: ecv });
};
insertVersion("sparky-forms", "1.1.2", "1.1.0");
insertVersion("forms", "1.0.1", "1.0.0");
insertVersion("sparkle", "2.1.1", "2.1.0");
insertVersion("sparkle", "2.1.0", "2.1.0");
insertVersion("sparkle", "1.0.0", "1.0.0");
insertVersion("awesome-dropdown", "1.5.0", "1.0.0");
insertVersion("dropdown", "1.2.2", "1.0.0");
insertVersion("jquery-widgets", "1.0.0", "1.0.0");
insertVersion("jquery-widgets", "1.0.2", "1.0.0");
insertVersion("jquery", "1.8.0", "1.0.0");
insertVersion("jquery", "1.9.0", "1.0.0");

var insertBuild = function (name, version, ecv, deps) {
  Builds.insert({ packageName: name, version: version,
                  earliestCompatibleVersion: ecv, architecture: "all",
                  dependencies: deps});
};

insertBuild("sparky-forms", "1.1.2", "1.1.0", [{ packageName: "forms", version: "=1.0.1" }, { packageName: "sparkle", version: "=2.1.1" }]);
insertBuild("forms", "1.0.1", "1.0.0", [{ packageName: "sparkle", version: "2.1.0" }, { packageName: "jquery-widgets", version: "1.0.0" }]);
insertBuild("sparkle", "2.1.0", "2.1.0", [{ packageName: "jquery", version: "1.8.2" }]);
insertBuild("sparkle", "2.1.1", "2.1.0", [{ packageName: "jquery", version: "1.8.2" }]);
insertBuild("sparkle", "1.0.0", "1.0.0");
insertBuild("awesome-dropdown", "1.5.0", "1.0.0", [{ packageName: "dropdown", version: "=1.2.2" }]);
insertBuild("dropdown", "1.2.2", "1.0.0", [{ packageName: "jquery-widgets", version: "1.0.0" }]);
insertBuild("jquery-widgets", "1.0.0", "1.0.0", [{ packageName: "jquery", version: "1.8.0" }, { packageName: "sparkle", version: "2.1.1" }]);
insertBuild("jquery-widgets", "1.0.2", "1.0.0", [{ packageName: "jquery", version: "1.8.0" }, { packageName: "sparkle", version: "2.1.1" }]);
insertBuild("jquery", "1.8.0", "1.8.0");
insertBuild("jquery", "1.8.2", "1.8.0");

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
    "jquery-widgets": "1.0.2",
    "jquery": "1.8.2"
  });
});

